/**
 * Session cleanup for in-memory store
 *
 * The default express-session MemoryStore never removes expired sessions,
 * causing a memory leak. This function manually cleans up expired sessions.
 *
 * For production with many users, consider using a proper session store like:
 * - connect-sqlite3 (SQLite-backed sessions)
 * - connect-redis (Redis-backed sessions)
 */

import type { Store } from "express-session"

/**
 * Clean up expired sessions from the in-memory store
 * This prevents memory leaks in long-running processes
 */
export function cleanupExpiredSessions(sessionStore: Store) {
  if (!sessionStore || typeof sessionStore.all !== "function") {
    console.warn("⚠️  Session store doesn't support cleanup - consider using a persistent store")
    return
  }

  try {
    // Get all sessions
    sessionStore.all((err, sessions) => {
      if (err) {
        console.error("❌ Error reading sessions:", err)
        return
      }

      if (!sessions) {
        return
      }

      let cleaned = 0
      const now = Date.now()

      // Iterate through all sessions
      Object.keys(sessions).forEach((sid) => {
        const session = sessions[sid]

        // Check if session has expired
        if (session && session.cookie && session.cookie.expires) {
          const expiresAt = new Date(session.cookie.expires).getTime()

          if (expiresAt < now) {
            // Session has expired - remove it
            sessionStore.destroy(sid, (destroyErr) => {
              if (destroyErr) {
                console.error(`⚠️  Failed to destroy session ${sid}:`, destroyErr)
              } else {
                cleaned++
              }
            })
          }
        }
      })

      if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} expired sessions from memory`)
      }
    })
  } catch (err: any) {
    console.error("❌ Error during session cleanup:", err.message)
  }
}

/**
 * Start periodic session cleanup
 * Runs every hour to prevent memory buildup
 */
export function startSessionCleanup(sessionStore: Store) {
  // Run immediately on startup
  cleanupExpiredSessions(sessionStore)

  // Then run every hour
  setInterval(() => {
    cleanupExpiredSessions(sessionStore)
  }, 60 * 60 * 1000) // 1 hour

  console.log("✓ Session cleanup scheduled (runs hourly)")
}
