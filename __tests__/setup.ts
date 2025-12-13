import { beforeAll, afterAll } from "vitest"
import dotenv from "dotenv"

// Load test environment variables
dotenv.config({ path: ".env.test" })

// Set test environment
process.env.NODE_ENV = "test"

// Mock environment variables for tests
process.env.EXTERNAL_URL = process.env.EXTERNAL_URL || "http://localhost:3000"
process.env.PLEX_CLIENT_ID = process.env.PLEX_CLIENT_ID || "test-client-id"
process.env.PLEX_SERVER_ID = process.env.PLEX_SERVER_ID || "test-server-id"
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret"

beforeAll(() => {
  // Global test setup
  console.log("🧪 Starting test suite...")
})

afterAll(() => {
  // Global test cleanup
  console.log("✅ Test suite completed")
})
