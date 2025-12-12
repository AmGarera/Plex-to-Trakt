import cron from "node-cron"
import { prisma } from "./prisma.js"
import { refreshTraktToken } from "./tokenRefresh.js"
import { cleanupSyncHistory, cleanupOrphanedProgress } from "./historyCleanup.js"

export function startTokenRefreshCron() {
  // Run token refresh every week on Sunday at 3 AM
  cron.schedule("0 3 * * 0", async () => {
    console.log("🔄 Running scheduled Trakt refresh token maintenance...")

    try {
      // Find all users with Trakt refresh tokens that haven't been refreshed in 60+ days
      // This keeps the refresh token alive (they expire after 90 days of inactivity)
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

      const users = await prisma.user.findMany({
        where: {
          traktRefreshToken: { not: null },
          traktExpiresAt: {
            lte: sixtyDaysAgo,
          },
        },
      })

      console.log(`Found ${users.length} users needing refresh token renewal`)

      for (const user of users) {
        try {
          await refreshTraktToken(user)
          console.log(`✅ Refreshed tokens for user: ${user.plexUsername}`)
        } catch (err: any) {
          console.error(`❌ Failed to refresh tokens for user ${user.plexUsername}:`, err.message)
        }
      }

      console.log("🔄 Refresh token maintenance completed")
    } catch (err: any) {
      console.error("❌ Error during token refresh cron:", err.message)
    }
  })

  // Run cleanup daily at 4 AM (after token refresh)
  cron.schedule("0 4 * * *", async () => {
    console.log("🧹 Running scheduled cleanup tasks...")

    // Clean up orphaned progress records (paused sessions, missed stop events)
    await cleanupOrphanedProgress()

    // Clean up old sync history records
    await cleanupSyncHistory()

    console.log("✅ Daily cleanup completed")
  })

  console.log("✓ Refresh token maintenance cron job scheduled (runs weekly on Sundays at 3 AM)")
  console.log("✓ Daily cleanup cron job scheduled (runs daily at 4 AM)")
  console.log("  - Orphaned progress records cleanup")
  console.log("  - Sync history cleanup (if enabled)")
}
