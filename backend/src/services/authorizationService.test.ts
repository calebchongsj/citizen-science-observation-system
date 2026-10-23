import { beforeEach, describe, expect, it, vi } from "vitest"
import { isAdmin, isGroupLeader, isWalkParticipant } from "./authorizationService"

type MockParticipation = {
  walk_id: string
  user_id: string
  role?: string
}

type MockWalk = {
  walk_id: string
  group_leader_id: string | null
}

let mockParticipations: MockParticipation[] = []
let mockWalks: Record<string, MockWalk> = {}

vi.mock("../lib/firebase-admin", () => ({
  db: {
    collection: (name: string) => {
      if (name === "walk_participations") {
        return {
          where: (_fieldA: string, _opA: string, walkId: string) => ({
            where: (_fieldB: string, _opB: string, userId: string) => ({
              get: async () => {
                const docs = mockParticipations
                  .filter((p) => p.walk_id === walkId && p.user_id === userId)
                  .map((p) => ({
                    data: () => p,
                  }))

                return {
                  empty: docs.length === 0,
                  docs,
                }
              },
            }),
          }),
        }
      }

      if (name === "walks") {
        return {
          doc: (walkId: string) => ({
            get: async () => {
              const walk = mockWalks[walkId]
              return {
                exists: !!walk,
                data: () => walk,
              }
            },
          }),
        }
      }

      throw new Error(`Unexpected collection: ${name}`)
    },
  },
}))

describe("authorizationService", () => {
  beforeEach(() => {
    mockParticipations = []
    mockWalks = {}
  })

  describe("isAdmin", () => {
    it("returns true for admin role", () => {
      expect(
        isAdmin({
          uid: "u1",
          email: "user@example.com",
          role: "admin",
        }),
      ).toBe(true)
    })

    it("returns true for bootstrap admin email", () => {
      expect(
        isAdmin({
          uid: "u2",
          email: "calebchongsj@gmail.com",
          role: "user",
        }),
      ).toBe(true)
    })

    it("returns false for non-admin role and email", () => {
      expect(
        isAdmin({
          uid: "u3",
          email: "volunteer@example.com",
          role: "user",
        }),
      ).toBe(false)
    })
  })

  describe("isWalkParticipant", () => {
    it("returns true when participation exists", async () => {
      mockParticipations.push({
        walk_id: "w1",
        user_id: "u1",
      })

      await expect(isWalkParticipant("u1", "w1")).resolves.toBe(true)
    })

    it("returns false when participation does not exist", async () => {
      await expect(isWalkParticipant("u1", "w1")).resolves.toBe(false)
    })
  })

  describe("isGroupLeader", () => {
    it("returns true when participation role is GROUP_LEADER", async () => {
      mockParticipations.push({
        walk_id: "w1",
        user_id: "u1",
        role: "GROUP_LEADER",
      })

      await expect(isGroupLeader("u1", "w1")).resolves.toBe(true)
    })

    it("returns true when walk.group_leader_id matches user (fallback path)", async () => {
      mockParticipations.push({
        walk_id: "w1",
        user_id: "u1",
      })
      mockWalks.w1 = {
        walk_id: "w1",
        group_leader_id: "u1",
      }

      await expect(isGroupLeader("u1", "w1")).resolves.toBe(true)
    })

    it("returns false when user is not leader", async () => {
      mockParticipations.push({
        walk_id: "w1",
        user_id: "u1",
      })
      mockWalks.w1 = {
        walk_id: "w1",
        group_leader_id: "someone-else",
      }

      await expect(isGroupLeader("u1", "w1")).resolves.toBe(false)
    })

    it("returns false when user is not even a participant", async () => {
      mockWalks.w1 = {
        walk_id: "w1",
        group_leader_id: "u1",
      }

      await expect(isGroupLeader("u1", "w1")).resolves.toBe(false)
    })
  })
})
