import axios from "axios"
import { refreshTraktToken } from "./tokenRefresh.js"
import { prisma } from "./prisma.js"

/**
 * Sync a finished Plex media item to Trakt watch history
 * @param {Object} user - Prisma user record
 * @param {Object} md - Plex Metadata object from webhook
 * @param {Object} ids - Parsed IDs (tmdb, imdb, tvdb)
 */
export async function syncToTrakt(user: any, md: any, ids: any) {
  // Ensure Trakt token is fresh
  user = await refreshTraktToken(user)

  let body
  if (md.type === "movie") {
    body = { movies: [{ ids }] }
  } else if (md.type === "episode") {
    body = { episodes: [{ ids }] }
  } else {
    return // unsupported type
  }

  try {
    await axios.post("https://api.trakt.tv/sync/history", body, {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": user.traktClientId,
        Authorization: `Bearer ${user.traktAccessToken}`,
      },
    })

    // Log successful sync
    await prisma.syncHistory.create({
      data: {
        userId: user.id,
        mediaType: md.type,
        title: md.title,
        guid: md.guid,
        syncType: "scrobble",
        progress: 100,
        success: true,
      },
    })
  } catch (err: any) {
    // Log failed sync
    await prisma.syncHistory.create({
      data: {
        userId: user.id,
        mediaType: md.type,
        title: md.title,
        guid: md.guid,
        syncType: "scrobble",
        progress: 100,
        success: false,
        errorMsg: err.message || "Unknown error",
      },
    })

    throw err
  }
}
