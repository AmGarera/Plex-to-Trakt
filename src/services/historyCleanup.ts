import { prisma } from "./prisma.js"

/**
 * Clean up orphaned SyncProgress records (stuck from missed stop events or paused sessions)
 * Removes any progress records that haven't been updated in 24 hours
 */
export async function cleanupOrphanedProgress() {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const result = await prisma.syncProgress.deleteMany({
      where: {
        lastEventAt: {
          lt: twentyFourHoursAgo,
        },
      },
    })

    if (result.count > 0) {
      console.log(`🗑️  Cleaned up ${result.count} orphaned progress records (inactive for 24+ hours)`)
    }

    return result.count
  } catch (err: any) {
    console.error("❌ Error cleaning up orphaned progress:", err.message)
    return 0
  }
}

/**
 * Clean up old sync history records based on user retention settings
 */
export async function cleanupSyncHistory() {
  try {
    // Get all users with their retention settings
    const users = await prisma.user.findMany({
      select: {
        id: true,
        plexUsername: true,
        syncHistoryRetention: true,
      },
    })

    let totalDeleted = 0

    for (const user of users) {
      const retentionDays = user.syncHistoryRetention || 7
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

      // Delete old records for this user
      const result = await prisma.syncHistory.deleteMany({
        where: {
          userId: user.id,
          createdAt: {
            lt: cutoffDate,
          },
        },
      })

      if (result.count > 0) {
        console.log(`🗑️  Deleted ${result.count} old sync records for user ${user.plexUsername} (older than ${retentionDays} days)`)
        totalDeleted += result.count
      }
    }

    if (totalDeleted > 0) {
      console.log(`✅ Cleanup complete: ${totalDeleted} total records deleted`)

      // Vacuum the database to reclaim space
      await vacuumDatabase()
    } else {
      console.log("✅ No old records to clean up")
    }

    return totalDeleted
  } catch (err: any) {
    console.error("❌ Error during sync history cleanup:", err.message)
    return 0
  }
}

/**
 * Vacuum SQLite database to reclaim disk space after deletions
 */
async function vacuumDatabase() {
  try {
    // Execute VACUUM command on SQLite
    await prisma.$executeRawUnsafe("VACUUM")
    console.log("✅ Database vacuumed - disk space reclaimed")
  } catch (err: any) {
    console.error("⚠️  Failed to vacuum database:", err.message)
  }
}

/**
 * Log sync history only if user has it enabled
 */
export async function logSyncHistory(
  userId: number,
  mediaType: string,
  title: string | null,
  guid: string | null,
  syncType: string,
  progress: number | null,
  success: boolean,
  errorMsg?: string
) {
  try {
    // Check if user has history logging enabled
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { enableSyncHistory: true },
    })

    if (!user?.enableSyncHistory) {
      // History logging disabled - skip
      return
    }

    await prisma.syncHistory.create({
      data: {
        userId,
        mediaType,
        title,
        guid,
        syncType,
        progress,
        success,
        errorMsg: errorMsg || null,
      },
    })
  } catch (err: any) {
    // Don't throw - logging failures shouldn't break sync
    console.error("⚠️  Failed to log sync history:", err.message)
  }
}
