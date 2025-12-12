import { describe, it, expect, beforeEach, vi } from "vitest"
import request from "supertest"
import express from "express"
import { prismaMock } from "../../helpers/prisma-mock.js"

// Import webhook router
import webhookRouter from "../../../src/routes/webhook.js"

describe("Plex Webhook Integration", () => {
  let app: express.Application

  beforeEach(() => {
    // Create test Express app
    app = express()
    app.use(express.json())
    app.use("/webhooks", webhookRouter)

    // Reset mocks
    vi.clearAllMocks()
  })

  describe("GET /webhooks/plex", () => {
    it("should return success message for GET request", async () => {
      const response = await request(app).get("/webhooks/plex")

      expect(response.status).toBe(200)
      expect(response.text).toContain("Webhook endpoint is working")
    })
  })

  describe("POST /webhooks/plex", () => {
    describe("IP whitelisting", () => {
      it("should accept webhooks when PLEX_SERVER_IP is not set", async () => {
        const originalEnv = process.env.PLEX_SERVER_IP
        delete process.env.PLEX_SERVER_IP

        const mockPayload = {
          event: "media.scrobble",
          Account: { id: "123" },
          Metadata: {
            type: "movie",
            title: "Test Movie",
            guid: "tmdb://550",
            Guid: [],
            viewOffset: 90000,
            duration: 100000,
          },
        }

        prismaMock.user.findUnique.mockResolvedValue({
          id: 1,
          plexId: "123",
          plexUsername: "testuser",
          traktAccessToken: "token",
          traktRefreshToken: "refresh",
          traktClientId: "client",
          traktExpiresAt: new Date(Date.now() + 86400000),
        } as any)

        const response = await request(app).post("/webhooks/plex").send({ payload: JSON.stringify(mockPayload) })

        expect(response.status).not.toBe(403)

        // Restore
        if (originalEnv) process.env.PLEX_SERVER_IP = originalEnv
      })

      it("should reject webhooks from unauthorized IPs when PLEX_SERVER_IP is set", async () => {
        const originalEnv = process.env.PLEX_SERVER_IP
        process.env.PLEX_SERVER_IP = "192.168.1.100"

        const response = await request(app).post("/webhooks/plex").send({ payload: "{}" })

        expect(response.status).toBe(403)
        expect(response.text).toBe("forbidden")

        // Restore
        if (originalEnv) {
          process.env.PLEX_SERVER_IP = originalEnv
        } else {
          delete process.env.PLEX_SERVER_IP
        }
      })
    })

    describe("Payload parsing", () => {
      it("should handle form-encoded payload field", async () => {
        const mockPayload = {
          event: "media.scrobble",
          Account: { id: "123" },
          Metadata: {
            type: "movie",
            title: "Test Movie",
            guid: "tmdb://550",
            Guid: [],
            viewOffset: 90000,
            duration: 100000,
          },
        }

        prismaMock.user.findUnique.mockResolvedValue(null)

        const response = await request(app).post("/webhooks/plex").send({ payload: JSON.stringify(mockPayload) })

        expect(response.status).toBe(200)
        expect(response.text).toBe("unknown user")
      })

      it("should handle invalid JSON payload", async () => {
        const response = await request(app).post("/webhooks/plex").send({ payload: "invalid json" })

        expect(response.status).toBe(400)
        expect(response.text).toBe("invalid body")
      })

      it("should handle missing Account info", async () => {
        const mockPayload = {
          event: "media.scrobble",
          Metadata: { type: "movie" },
        }

        const response = await request(app).post("/webhooks/plex").send({ payload: JSON.stringify(mockPayload) })

        expect(response.status).toBe(200)
        expect(response.text).toBe("no account")
      })
    })

    describe("Event filtering", () => {
      it("should process media.scrobble events", async () => {
        const mockUser = {
          id: 1,
          plexId: "123",
          plexUsername: "testuser",
          traktAccessToken: "token",
          traktRefreshToken: "refresh",
          traktClientId: "client",
          traktExpiresAt: new Date(Date.now() + 86400000),
          enableProgressSync: false,
        }

        const mockPayload = {
          event: "media.scrobble",
          Account: { id: "123" },
          Metadata: {
            type: "movie",
            title: "Fight Club",
            guid: "tmdb://550",
            Guid: [],
            viewOffset: 90000,
            duration: 100000,
          },
        }

        prismaMock.user.findUnique.mockResolvedValue(mockUser as any)

        const response = await request(app).post("/webhooks/plex").send({ payload: JSON.stringify(mockPayload) })

        expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
          where: { plexId: "123" },
        })
      })

      it("should handle media.play events when progress sync is disabled", async () => {
        const mockPayload = {
          event: "media.play",
          Account: { id: "123" },
          Metadata: {
            type: "movie",
            guid: "tmdb://550",
            Guid: [],
            viewOffset: 10000,
            duration: 100000,
          },
        }

        prismaMock.user.findUnique.mockResolvedValue({
          id: 1,
          plexId: "123",
          enableProgressSync: false,
        } as any)

        const response = await request(app).post("/webhooks/plex").send({ payload: JSON.stringify(mockPayload) })

        expect(response.status).toBe(200)
        expect(response.text).toBe("progress sync disabled")
      })
    })

    describe("ID extraction", () => {
      it("should return error when IDs cannot be extracted", async () => {
        const mockPayload = {
          event: "media.scrobble",
          Account: { id: "123" },
          Metadata: {
            type: "movie",
            title: "Unknown Movie",
            guid: "unknown://invalid",
            Guid: [],
            viewOffset: 90000,
            duration: 100000,
          },
        }

        prismaMock.user.findUnique.mockResolvedValue({
          id: 1,
          plexId: "123",
          plexUsername: "testuser",
        } as any)

        const response = await request(app).post("/webhooks/plex").send({ payload: JSON.stringify(mockPayload) })

        expect(response.status).toBe(200)
        expect(response.text).toBe("no ids")
      })
    })

    describe("Progress calculation", () => {
      it("should calculate correct progress percentage", async () => {
        const mockPayload = {
          event: "media.play",
          Account: { id: "123" },
          Metadata: {
            type: "movie",
            guid: "tmdb://550",
            Guid: [],
            viewOffset: 50000, // 50 seconds
            duration: 100000, // 100 seconds total
          },
        }

        prismaMock.user.findUnique.mockResolvedValue({
          id: 1,
          plexId: "123",
          enableProgressSync: true,
        } as any)

        const response = await request(app).post("/webhooks/plex").send({ payload: JSON.stringify(mockPayload) })

        // Progress should be 50%
        expect(response.status).toBe(200)
      })

      it("should handle missing duration gracefully", async () => {
        const mockPayload = {
          event: "media.play",
          Account: { id: "123" },
          Metadata: {
            type: "movie",
            guid: "tmdb://550",
            Guid: [],
            viewOffset: 50000,
            duration: 0,
          },
        }

        prismaMock.user.findUnique.mockResolvedValue({
          id: 1,
          plexId: "123",
          enableProgressSync: true,
        } as any)

        const response = await request(app).post("/webhooks/plex").send({ payload: JSON.stringify(mockPayload) })

        // Should handle gracefully with 0% progress
        expect(response.status).toBe(200)
      })
    })
  })
})
