import { vi } from "vitest"
import { mockDeep, mockReset, DeepMockProxy } from "vitest-mock-extended"
import { PrismaClient } from "@prisma/client"

// Deep mock of Prisma Client
export const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>

// Mock the Prisma client module
vi.mock("../../src/services/prisma.js", () => ({
  prisma: prismaMock,
}))

// Reset all mocks before each test
beforeEach(() => {
  mockReset(prismaMock)
})
