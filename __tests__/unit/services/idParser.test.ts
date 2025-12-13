import { describe, it, expect } from "vitest"
import { extractIds } from "../../../src/services/idParser.js"

describe("ID Parser Service", () => {
  describe("TMDB ID extraction", () => {
    it("should extract TMDB ID from themoviedb:// format", () => {
      const result = extractIds("themoviedb://12345")
      expect(result).toEqual({ tmdb: 12345 })
    })

    it("should extract TMDB ID from tmdb:// format", () => {
      const result = extractIds("tmdb://67890")
      expect(result).toEqual({ tmdb: 67890 })
    })

    it("should extract TMDB ID from com.plexapp.agents.themoviedb format", () => {
      const result = extractIds("com.plexapp.agents.themoviedb://54321")
      expect(result).toEqual({ tmdb: 54321 })
    })
  })

  describe("IMDB ID extraction", () => {
    it("should extract IMDB ID from imdb:// format", () => {
      const result = extractIds("imdb://tt1234567")
      expect(result).toEqual({ imdb: "tt1234567" })
    })

    it("should extract IMDB ID from com.plexapp.agents.imdb format", () => {
      const result = extractIds("com.plexapp.agents.imdb://tt7654321")
      expect(result).toEqual({ imdb: "tt7654321" })
    })
  })

  describe("TVDB ID extraction", () => {
    it("should extract TVDB ID with season/episode from thetvdb:// format", () => {
      const result = extractIds("thetvdb://12345/2/10")
      expect(result).toEqual({ tvdb: 12345, season: 2, episode: 10 })
    })

    it("should extract TVDB ID without season/episode", () => {
      const result = extractIds("thetvdb://54321")
      expect(result).toEqual({ tvdb: 54321 })
    })

    it("should extract TVDB ID from tvdb:// format", () => {
      const result = extractIds("tvdb://98765/1/5")
      expect(result).toEqual({ tvdb: 98765, season: 1, episode: 5 })
    })

    it("should extract TVDB ID from com.plexapp.agents.thetvdb format with season/episode", () => {
      const result = extractIds("com.plexapp.agents.thetvdb://11111/3/7")
      expect(result).toEqual({ tvdb: 11111, season: 3, episode: 7 })
    })

    it("should extract TVDB ID from com.plexapp.agents.thetvdb format without season/episode", () => {
      const result = extractIds("com.plexapp.agents.thetvdb://22222")
      expect(result).toEqual({ tvdb: 22222 })
    })
  })

  describe("Plex:// format with Guid array", () => {
    it("should extract from Guid array when primary GUID is plex:// format", () => {
      const guids = [
        { id: "plex://movie/5d776b1b" },
        { id: "imdb://tt0111161" },
        { id: "tmdb://278" },
      ]

      const result = extractIds("plex://movie/5d776b1b", guids)
      expect(result).toEqual({ imdb: "tt0111161" })
    })

    it("should extract from Guid array with string GUIDs", () => {
      const guids = ["plex://movie/abc123", "tmdb://550", "imdb://tt0137523"]

      const result = extractIds("plex://movie/abc123", guids)
      expect(result).toEqual({ tmdb: 550 })
    })

    it("should prioritize primary GUID if it has valid ID", () => {
      const guids = [{ id: "imdb://tt0111161" }, { id: "tmdb://278" }]

      const result = extractIds("tmdb://550", guids)
      expect(result).toEqual({ tmdb: 550 })
    })
  })

  describe("Edge cases", () => {
    it("should return null for unknown GUID format", () => {
      const result = extractIds("unknown://12345")
      expect(result).toBeNull()
    })

    it("should return null for empty GUID", () => {
      const result = extractIds("")
      expect(result).toBeNull()
    })

    it("should return null for null GUID", () => {
      const result = extractIds(null as any)
      expect(result).toBeNull()
    })

    it("should return null when no valid IDs in Guid array", () => {
      const guids = [{ id: "plex://movie/abc" }, { id: "unknown://123" }]

      const result = extractIds("plex://movie/abc", guids)
      expect(result).toBeNull()
    })

    it("should handle empty Guid array", () => {
      const result = extractIds("plex://movie/abc", [])
      expect(result).toBeNull()
    })
  })

  describe("Case insensitivity", () => {
    it("should handle uppercase THEMOVIEDB", () => {
      const result = extractIds("THEMOVIEDB://12345")
      expect(result).toEqual({ tmdb: 12345 })
    })

    it("should handle mixed case IMDB", () => {
      const result = extractIds("ImDb://tt1234567")
      expect(result).toEqual({ imdb: "tt1234567" })
    })

    it("should handle uppercase TVDB", () => {
      const result = extractIds("THETVDB://12345/2/10")
      expect(result).toEqual({ tvdb: 12345, season: 2, episode: 10 })
    })
  })
})
