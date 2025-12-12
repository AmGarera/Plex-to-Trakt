import axios from "axios"
import { refreshTraktToken } from "./tokenRefresh.js"
import { prisma } from "./prisma.js"
import { logSyncHistory } from "./historyCleanup.js"

/**
 * Scrobble progress to Trakt (start, pause, stop events)
 * @param user - Prisma user record
 * @param md - Plex Metadata object from webhook
 * @param ids - Parsed IDs (tmdb, imdb, tvdb)
 * @param action - "start", "pause", or "stop"
 * @param progress - Playback progress percentage (0-100)
 */
export async function scrobbleToTrakt(user: any, md: any, ids: any, action: "start" | "pause" | "stop", progress: number) {
  // Ensure Trakt token is fresh
  user = await refreshTraktToken(user)

  let body: any
  if (md.type === "movie") {
    body = {
      movie: { ids },
      progress: progress,
    }
  } else if (md.type === "episode") {
    body = {
      episode: { ids },
      progress: progress,
    }
  } else {
    throw new Error("Unsupported media type")
  }

  try {
    const response = await axios.post(`https://api.trakt.tv/scrobble/${action}`, body, {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": user.traktClientId,
        Authorization: `Bearer ${user.traktAccessToken}`,
      },
    })

    // Log successful sync (only if user has history enabled)
    await logSyncHistory(user.id, md.type, md.title, md.guid, action, progress, true)

    return response.data
  } catch (err: any) {
    // Log failed sync (only if user has history enabled)
    await logSyncHistory(user.id, md.type, md.title, md.guid, action, progress, false, err.message || "Unknown error")

    throw err
  }
}

/**
 * Update or create progress tracking record
 */
export async function updateProgressTracking(
  userId: number,
  guid: string,
  mediaType: string,
  title: string,
  ids: any,
  progress: number
) {
  const progressData = {
    userId,
    guid,
    mediaType,
    title,
    tmdbId: ids.tmdb || null,
    imdbId: ids.imdb || null,
    tvdbId: ids.tvdb || null,
    season: ids.season || null,
    episode: ids.episode || null,
    progress,
    lastEventAt: new Date(),
  }

  await prisma.syncProgress.upsert({
    where: {
      userId_guid: {
        userId,
        guid,
      },
    },
    update: {
      progress,
      lastEventAt: new Date(),
    },
    create: progressData,
  })
}

/**
 * Check if we should sync progress based on throttling rules
 */
export async function shouldSyncProgress(user: any, guid: string, newProgress: number): Promise<boolean> {
  // If progress sync is disabled, don't sync
  if (!user.enableProgressSync) {
    return false
  }

  // Find existing progress record
  const existing = await prisma.syncProgress.findUnique({
    where: {
      userId_guid: {
        userId: user.id,
        guid,
      },
    },
  })

  // If no existing record, this is a new session - sync it
  if (!existing) {
    return true
  }

  // Check if enough time has passed since last sync
  const secondsSinceSync = (Date.now() - existing.lastSyncedAt.getTime()) / 1000
  if (secondsSinceSync < user.progressSyncInterval) {
    return false
  }

  // Check if progress changed enough
  const progressDelta = Math.abs(newProgress - existing.progress)
  if (progressDelta < user.progressSyncThreshold) {
    return false
  }

  return true
}

/**
 * Mark progress as synced
 */
export async function markProgressSynced(userId: number, guid: string) {
  await prisma.syncProgress.update({
    where: {
      userId_guid: {
        userId,
        guid,
      },
    },
    data: {
      lastSyncedAt: new Date(),
    },
  })
}

/**
 * Clean up old progress records (for stopped/finished playback)
 */
export async function cleanupProgressRecord(userId: number, guid: string) {
  try {
    await prisma.syncProgress.delete({
      where: {
        userId_guid: {
          userId,
          guid,
        },
      },
    })
  } catch (err) {
    // Ignore if record doesn't exist
  }
}
