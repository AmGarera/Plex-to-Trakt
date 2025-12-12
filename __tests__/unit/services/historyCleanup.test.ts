import { describe, it, expect, beforeEach } from "vitest"
import { prismaMock } from "../../helpers/prisma-mock.js"
import { cleanupOrphanedProgress, cleanupSyncHistory, logSyncHistory } from "../../../src/services/historyCleanup.js"

describe("History Cleanup Service", () => {
  beforeEach(() => {
    // Reset mocks before each test
  })

  describe("cleanupOrphanedProgress", () => {
    it("should delete progress records older than 24 hours", async () => {
      prismaMock.syncProgress.deleteMany.mockResolvedValue({ count: 5 })

      const result = await cleanupOrphanedProgress()

      expect(result).toBe(5)
      expect(prismaMock.syncProgress.deleteMany).toHaveBeenCalledWith({
        where: {
          lastEventAt: {
            lt: expect.any(Date),
          },
        },
      })
    })

    it("should return 0 when no orphaned records found", async () => {
      prismaMock.syncProgress.deleteMany.mockResolvedValue({ count: 0 })

      const result = await cleanupOrphanedProgress()

      expect(result).toBe(0)
    })

    it("should handle errors gracefully", async () => {
      prismaMock.syncProgress.deleteMany.mockRejectedValue(new Error("Database error"))

      const result = await cleanupOrphanedProgress()

      expect(result).toBe(0)
    })
  })

  describe("cleanupSyncHistory", () => {
    it("should delete old history records based on user retention", async () => {
      const mockUsers = [
        { id: 1, plexUsername: "user1", syncHistoryRetention: 7 },
        { id: 2, plexUsername: "user2", syncHistoryRetention: 30 },
      ]

      prismaMock.user.findMany.mockResolvedValue(mockUsers as any)
      prismaMock.syncHistory.deleteMany
        .mockResolvedValueOnce({ count: 10 })
        .mockResolvedValueOnce({ count: 5 })
      prismaMock.$executeRawUnsafe.mockResolvedValue(undefined as any)

      const result = await cleanupSyncHistory()

      expect(result).toBe(15)
      expect(prismaMock.syncHistory.deleteMany).toHaveBeenCalledTimes(2)
      expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledWith("VACUUM")
    })

    it("should not vacuum if no records deleted", async () => {
      prismaMock.user.findMany.mockResolvedValue([])

      const result = await cleanupSyncHistory()

      expect(result).toBe(0)
      expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled()
    })

    it("should handle vacuum errors gracefully", async () => {
      const mockUsers = [{ id: 1, plexUsername: "user1", syncHistoryRetention: 7 }]

      prismaMock.user.findMany.mockResolvedValue(mockUsers as any)
      prismaMock.syncHistory.deleteMany.mockResolvedValue({ count: 5 })
      prismaMock.$executeRawUnsafe.mockRejectedValue(new Error("VACUUM failed"))

      const result = await cleanupSyncHistory()

      expect(result).toBe(5) // Should still return count even if vacuum fails
    })
  })

  describe("logSyncHistory", () => {
    it("should log sync history when user has history enabled", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        enableSyncHistory: true,
      } as any)
      prismaMock.syncHistory.create.mockResolvedValue({} as any)

      await logSyncHistory(1, "movie", "Test Movie", "tmdb://123", "scrobble", 100, true)

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { enableSyncHistory: true },
      })
      expect(prismaMock.syncHistory.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          mediaType: "movie",
          title: "Test Movie",
          guid: "tmdb://123",
          syncType: "scrobble",
          progress: 100,
          success: true,
          errorMsg: null,
        },
      })
    })

    it("should not log when user has history disabled", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        enableSyncHistory: false,
      } as any)

      await logSyncHistory(1, "movie", "Test Movie", "tmdb://123", "scrobble", 100, true)

      expect(prismaMock.syncHistory.create).not.toHaveBeenCalled()
    })

    it("should not log when user not found", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)

      await logSyncHistory(1, "movie", "Test Movie", "tmdb://123", "scrobble", 100, true)

      expect(prismaMock.syncHistory.create).not.toHaveBeenCalled()
    })

    it("should log failures with error message", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        enableSyncHistory: true,
      } as any)
      prismaMock.syncHistory.create.mockResolvedValue({} as any)

      await logSyncHistory(1, "episode", "Test Episode", "tvdb://456/1/2", "start", 15, false, "Network error")

      expect(prismaMock.syncHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          success: false,
          errorMsg: "Network error",
        }),
      })
    })

    it("should handle logging errors gracefully", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 1,
        enableSyncHistory: true,
      } as any)
      prismaMock.syncHistory.create.mockRejectedValue(new Error("Database error"))

      // Should not throw - logging failures shouldn't break sync
      await expect(
        logSyncHistory(1, "movie", "Test", "tmdb://123", "scrobble", 100, true)
      ).resolves.toBeUndefined()
    })
  })
})
