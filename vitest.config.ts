import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Use globals (describe, it, expect) without imports
    globals: true,

    // Node.js environment for Express/Prisma testing
    environment: "node",

    // Load .env.test file for test environment variables
    setupFiles: ["dotenv/config"],

    // Single thread mode - CRITICAL for SQLite/Prisma tests
    // Prevents database lock errors when running parallel tests
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Timeouts for async operations (Prisma, API calls, etc.)
    hookTimeout: 60000,
    testTimeout: 30000,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "generated/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/__tests__/**",
        "**/prisma/**",
        "vitest.config.ts",
        "tsconfig.json",
      ],
      // Aim for high coverage
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },

    // Test file patterns
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
    exclude: ["node_modules", "dist", "generated"],
  },
})
