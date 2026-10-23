import { beforeEach, describe, expect, it, vi } from "vitest"
import { WalkStatus } from "../walks/walk.types"
import { NotFoundError } from "../../lib/errors"
import * as sightingRepo from "./sighting.repository"
import {
  createSightingForWalk,
  listSightingsForWalk,
  submitSighting,
  updateSightingDraft,
} from "./sighting.service"

vi.mock("./sighting.repository")

let mockWalkExists = true
let mockWalkLeaderId = "leader-1"
let mockWalkStatus: WalkStatus = WalkStatus.UPCOMING
const mockWalkDateTime = "2026-12-31T12:00:00.000Z" // valid so effectiveEndIso works; window in future
let mockParticipationEmpty = false
const mockSightingSet = vi.fn(async () => undefined)

vi.mock("../../lib/firebase-admin", () => ({
  db: {
    collection: (name: string) => {
      if (name === "walks") {
        return {
          doc: () => ({
            get: async () => ({
              exists: mockWalkExists,
              data: () => ({
                group_leader_id: mockWalkLeaderId,
                status: mockWalkStatus,
                date_time: mockWalkDateTime,
              }),
            }),
          }),
        }
      }

      if (name === "walk_participations") {
        return {
          where: () => ({
            where: () => ({
              get: async () => ({
                empty: mockParticipationEmpty,
              }),
            }),
          }),
        }
      }

      if (name === "sightings") {
        return {
          doc: () => ({
            set: mockSightingSet,
          }),
        }
      }

      throw new Error(`Unexpected collection: ${name}`)
    },
  },
}))

describe("Sighting Service", () => {
  beforeEach(() => {
    mockWalkExists = true
    mockWalkLeaderId = "leader-1"
    mockWalkStatus = WalkStatus.UPCOMING
    mockParticipationEmpty = false
    mockSightingSet.mockReset()
    vi.mocked(sightingRepo.createSighting).mockReset()
    vi.mocked(sightingRepo.getSightingById).mockReset()
    vi.mocked(sightingRepo.listSightingsByWalk).mockReset()
  })

  it("should create sighting when requester is walk group leader", async () => {
    mockWalkStatus = WalkStatus.IN_PROGRESS
    vi.mocked(sightingRepo.createSighting).mockImplementation(async (payload) => ({
      sighting_id: "s1",
      ...payload,
    }))

    const result = await createSightingForWalk({
      walkId: "w1",
      userId: "leader-1",
      input: {
        adult_count: 3,
        juvenile_count: 1,
        infant_count: 0,
        behavior: "feeding",
        notes: "near mangrove area",
        images_references: [],
        latitude: 1.3521,
        longitude: 103.8198,
      },
    })

    expect(result.sighting_id).toBe("s1")
    expect(result.walk_id).toBe("w1")
    expect(result.recorded_by_user_id).toBe("leader-1")
    expect(result.submission_status).toBe("DRAFT")
    expect(result.observation_timestamp).toBeDefined()
    expect(sightingRepo.createSighting).toHaveBeenCalledOnce()
  })

  it("should reject create when requester is not walk group leader", async () => {
    mockWalkLeaderId = "other-leader"

    await expect(
      createSightingForWalk({
        walkId: "w1",
        userId: "leader-1",
        input: {
          adult_count: 1,
          juvenile_count: 0,
          infant_count: 0,
          behavior: "moving",
          notes: "test",
          images_references: [],
          latitude: 1.0,
          longitude: 103.0,
        },
      }),
    ).rejects.toThrow("Only the designated group leader can manage sightings for this walk")
  })

  it("should reject listing for non-participant and non-admin", async () => {
    mockParticipationEmpty = true

    await expect(
      listSightingsForWalk({
        walkId: "w1",
        userId: "user-1",
        role: "user",
        email: "user@example.com",
      }),
    ).rejects.toThrow("User is not a participant of this walk")
  })

  it("should backfill last_edited_at with observation_timestamp when missing", async () => {
    vi.mocked(sightingRepo.listSightingsByWalk).mockResolvedValue([
      {
        sighting_id: "s1",
        walk_id: "w1",
        recorded_by_user_id: "leader-1",
        adult_count: 2,
        juvenile_count: 0,
        infant_count: 0,
        behavior: "resting",
        notes: "legacy sighting",
        images_references: [],
        observation_timestamp: "2026-03-17T10:00:00.000Z",
        latitude: 1.2,
        longitude: 103.2,
        submission_status: "DRAFT",
      },
    ])

    const result = await listSightingsForWalk({
      walkId: "w1",
      userId: "participant-1",
      role: "user",
      email: "participant@example.com",
    })

    expect(result).toHaveLength(1)
    expect(result[0].last_edited_at).toBe("2026-03-17T10:00:00.000Z")
  })

  it("should allow admin user to list sightings without participation", async () => {
    mockParticipationEmpty = true
    vi.mocked(sightingRepo.listSightingsByWalk).mockResolvedValue([
      {
        sighting_id: "s1",
        walk_id: "w1",
        recorded_by_user_id: "leader-1",
        adult_count: 1,
        juvenile_count: 0,
        infant_count: 0,
        behavior: "moving",
        notes: "visible to admin",
        images_references: [],
        observation_timestamp: "2026-03-17T10:00:00.000Z",
        last_edited_at: "2026-03-17T11:00:00.000Z",
        latitude: 1.2,
        longitude: 103.2,
        submission_status: "SUBMITTED",
      },
    ])

    const result = await listSightingsForWalk({
      walkId: "w1",
      userId: "admin-1",
      role: "admin",
      email: "admin@example.com",
    })

    expect(result).toHaveLength(1)
    expect(sightingRepo.listSightingsByWalk).toHaveBeenCalledWith("w1")
  })

  it("should block updating sighting when already submitted", async () => {
    vi.mocked(sightingRepo.getSightingById).mockResolvedValue({
      sighting_id: "s1",
      walk_id: "w1",
      recorded_by_user_id: "leader-1",
      adult_count: 2,
      juvenile_count: 0,
      infant_count: 0,
      behavior: "resting",
      notes: "done",
      images_references: [],
      observation_timestamp: "2026-03-17T10:00:00.000Z",
      latitude: 1.2,
      longitude: 103.2,
      submission_status: "SUBMITTED",
    })

    await expect(
      updateSightingDraft({
        walkId: "w1",
        sightingId: "s1",
        userId: "leader-1",
        input: { notes: "updated" },
      }),
    ).rejects.toThrow("Submitted sightings cannot be edited")
  })

  it("should reject updating when sighting does not belong to the walk", async () => {
    vi.mocked(sightingRepo.getSightingById).mockResolvedValue({
      sighting_id: "s1",
      walk_id: "other-walk",
      recorded_by_user_id: "leader-1",
      adult_count: 2,
      juvenile_count: 0,
      infant_count: 0,
      behavior: "resting",
      notes: "draft",
      images_references: [],
      observation_timestamp: "2026-03-17T10:00:00.000Z",
      latitude: 1.2,
      longitude: 103.2,
      submission_status: "DRAFT",
    })

    await expect(
      updateSightingDraft({
        walkId: "w1",
        sightingId: "s1",
        userId: "leader-1",
        input: { notes: "updated" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it("should submit draft sighting and lock it", async () => {
    mockWalkStatus = WalkStatus.IN_PROGRESS
    vi.mocked(sightingRepo.getSightingById).mockResolvedValue({
      sighting_id: "s1",
      walk_id: "w1",
      recorded_by_user_id: "leader-1",
      adult_count: 2,
      juvenile_count: 0,
      infant_count: 0,
      behavior: "resting",
      notes: "draft",
      images_references: [],
      observation_timestamp: "2026-03-17T10:00:00.000Z",
      latitude: 1.2,
      longitude: 103.2,
      submission_status: "DRAFT",
    })

    const result = await submitSighting({
      walkId: "w1",
      sightingId: "s1",
      userId: "leader-1",
    })

    expect(result.submission_status).toBe("SUBMITTED")
    expect(mockSightingSet).toHaveBeenCalledOnce()
  })
})
