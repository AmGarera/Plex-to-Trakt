import express from "express"
import multer from "multer"
import { prisma } from "../services/prisma.js"
import { extractIds } from "../services/idParser.js"
import { syncToTrakt } from "../services/syncTrakt.js"
import {
  scrobbleToTrakt,
  updateProgressTracking,
  shouldSyncProgress,
  markProgressSynced,
  cleanupProgressRecord,
} from "../services/scrobbleTrakt.js"

const router = express.Router()
const upload = multer()

// Test endpoint to verify webhook is reachable
router.get("/plex", (req, res) => {
  console.log("GET request to /webhooks/plex - webhook is reachable!")
  res.send("Webhook endpoint is working! Use POST to send webhook data.")
})

router.post("/plex", upload.single("thumb"), async (req, res) => {
  // Security: Only accept webhooks from Plex server IP
  if (process.env.PLEX_SERVER_IP) {
    // Use direct socket IP only (don't trust x-forwarded-for header as it can be spoofed)
    const clientIp = req.socket.remoteAddress
    const allowedIp = process.env.PLEX_SERVER_IP

    // Extract IP from potential IPv6 format (::ffff:192.168.1.1 -> 192.168.1.1)
    const normalizedIp = String(clientIp).replace(/^::ffff:/, "")

    if (normalizedIp !== allowedIp) {
      console.log("🚫 Webhook rejected from unauthorized IP:", normalizedIp)
      return res.status(403).send("forbidden")
    }
  }

  let payload

  try {
    // Plex sends form-encoded data with a 'payload' field
    if (req.body.payload) {
      payload = JSON.parse(req.body.payload)
    } else if (typeof req.body === "string") {
      payload = JSON.parse(req.body)
    } else {
      payload = req.body
    }
  } catch (e: any) {
    console.error("Failed to parse webhook:", e.message)
    return res.status(400).send("invalid body")
  }

  const { event, Metadata: md, Account } = payload

  if (!Account || !Account.id) {
    return res.status(200).send("no account")
  }

  const user = await prisma.user.findUnique({ where: { plexId: String(Account.id) } })

  if (!user) {
    console.log("Unknown user - Plex ID:", Account.id)
    return res.status(200).send("unknown user")
  }

  // Extract IDs early (needed for all event types)
  const ids = extractIds(md.guid, md.Guid)
  if (!ids) {
    console.log("❌ Could not extract IDs from:", md?.guid)
    if (md.Guid && Array.isArray(md.Guid)) {
      console.log("   Available GUIDs:", md.Guid.map((g: any) => (typeof g === "string" ? g : g?.id)).join(", "))
    }
    return res.status(200).send("no ids")
  }

  // Calculate progress percentage from viewOffset and duration (in milliseconds)
  const viewOffset = parseInt(md.viewOffset || 0)
  const duration = parseInt(md.duration || 0)
  const progress = duration > 0 ? Math.round((viewOffset / duration) * 100) : 0

  console.log(`📺 Event: ${event} | ${md?.title} | Progress: ${progress}% | User: ${user.plexUsername}`)

  // Handle different event types
  try {
    if (event === "media.scrobble") {
      // Media finished (90%+ watched) - sync to history
      console.log("✓ Extracted IDs:", ids)
      await syncToTrakt(user, md, ids)
      await cleanupProgressRecord(user.id, md.guid)
      console.log("✅ Synced to Trakt history (scrobble)")
      return res.status(200).send("ok")
    }

    // Handle progress sync events (play, pause, resume, stop)
    if (!user.enableProgressSync) {
      return res.status(200).send("progress sync disabled")
    }

    // Update local progress tracking
    await updateProgressTracking(user.id, md.guid, md.type, md.title, ids, progress)

    let traktAction: "start" | "pause" | "stop" | null = null

    switch (event) {
      case "media.play":
        traktAction = "start"
        break
      case "media.pause":
        traktAction = "pause"
        break
      case "media.resume":
        // For resume, check if we should sync (throttling)
        if (await shouldSyncProgress(user, md.guid, progress)) {
          traktAction = "start"
        }
        break
      case "media.stop":
        traktAction = "stop"
        // Clean up progress record on stop
        await cleanupProgressRecord(user.id, md.guid)
        break
      default:
        // Unknown event type
        return res.status(200).send("ignored")
    }

    // Sync to Trakt if we have an action
    if (traktAction) {
      // For pause/resume events, check throttling
      if (traktAction === "pause" || (event === "media.resume" && traktAction === "start")) {
        if (!(await shouldSyncProgress(user, md.guid, progress))) {
          console.log(`⏭️  Skipping sync (throttled)`)
          return res.status(200).send("throttled")
        }
      }

      console.log("✓ Extracted IDs:", ids)
      await scrobbleToTrakt(user, md, ids, traktAction, progress)
      await markProgressSynced(user.id, md.guid)
      console.log(`✅ Scrobbled to Trakt (${traktAction} at ${progress}%)`)
      return res.status(200).send("ok")
    }

    return res.status(200).send("ok")
  } catch (err: any) {
    console.error("❌ Error syncing to Trakt:", err.message)
    return res.status(500).send("error")
  }
})

export default router
