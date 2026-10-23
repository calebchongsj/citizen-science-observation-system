import { beforeEach, describe, expect, it, vi } from "vitest"

const mockVerifyIdToken = vi.fn()
const mockWalksGet = vi.fn()
const mockSightingsGet = vi.fn()
const mockParticipationsGet = vi.fn()
const mockGetSignedUrl = vi.fn()

vi.mock("../../lib/firebase-admin", () => ({
  auth: {
    verifyIdToken: (token: string) => mockVerifyIdToken(token),
  },
  db: {
    collection: (name: string) => {
      if (name === "walks") {
        return { get: mockWalksGet }
      }

      if (name === "sightings") {
        return { get: mockSightingsGet }
      }

      if (name === "walk_participations") {
        return { get: mockParticipationsGet }
      }

      throw new Error(`Unexpected collection: ${name}`)
    },
  },
  storage: {
    bucket: () => ({
      file: (path: string) => ({
        getSignedUrl: () => mockGetSignedUrl(path),
      }),
    }),
  },
}))

describe("exportRoutes", () => {
  beforeEach(() => {
    mockVerifyIdToken.mockReset()
    mockWalksGet.mockReset()
    mockSightingsGet.mockReset()
    mockParticipationsGet.mockReset()
    mockGetSignedUrl.mockReset()
    mockGetSignedUrl.mockImplementation(async (path: string) => [
      `https://signed.example/${encodeURIComponent(path)}`,
    ])
  })

  it("should allow an admin to download survey data as CSV", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "admin-1",
      email: "calebchongsj@gmail.com",
      role: "admin",
    })
    mockWalksGet.mockResolvedValue({
      docs: [
        {
          id: "walk-1",
          data: () => ({
            walk_id: "walk-1",
            date_time: "2026-03-21T08:00:00.000Z",
            route_info: [[1.3, 103.8]],
            group_leader_id: "leader-1",
            status: "COMPLETED",
          }),
        },
      ],
    })
    mockSightingsGet.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: "sighting-1",
          data: () => ({
            sighting_id: "sighting-1",
            walk_id: "walk-1",
            adult_count: 2,
            juvenile_count: 1,
            infant_count: 0,
            behavior: "feeding",
            notes: "Mangrove edge",
            latitude: 1.301,
            longitude: 103.801,
            images_references: [],
            submission_status: "SUBMITTED",
            observation_timestamp: "2026-03-21T09:00:00.000Z",
          }),
        },
      ],
    })
    mockParticipationsGet.mockResolvedValue({
      docs: [{ data: () => ({ walk_id: "walk-1" }) }],
    })

    const { buildApp } = await import("../../app")
    const app = await buildApp({ logger: false, serveStatic: false })

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/export",
      headers: {
        authorization: "Bearer admin-token",
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toContain("text/csv")
    expect(response.headers["content-disposition"]).toBe('attachment; filename="survey_data.csv"')
    expect(response.body).toContain("walk_id,walk_date,group_leader_id,group_size")
    expect(response.body).toContain("sighting-1")

    await app.close()
  }, 10000)

  it("should allow an admin email even when the token role is user", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "admin-2",
      email: "calebchongsj@gmail.com",
      role: "user",
    })
    mockWalksGet.mockResolvedValue({
      docs: [
        {
          id: "walk-1",
          data: () => ({
            walk_id: "walk-1",
            date_time: "2026-03-21T08:00:00.000Z",
            route_info: [[1.3, 103.8]],
            group_leader_id: "leader-1",
            status: "COMPLETED",
          }),
        },
      ],
    })
    mockSightingsGet.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: "sighting-1",
          data: () => ({
            sighting_id: "sighting-1",
            walk_id: "walk-1",
            adult_count: 2,
            juvenile_count: 1,
            infant_count: 0,
            behavior: "feeding",
            notes: "Mangrove edge",
            latitude: 1.301,
            longitude: 103.801,
            images_references: [],
            submission_status: "SUBMITTED",
            observation_timestamp: "2026-03-21T09:00:00.000Z",
          }),
        },
      ],
    })
    mockParticipationsGet.mockResolvedValue({ docs: [] })

    const { buildApp } = await import("../../app")
    const app = await buildApp({ logger: false, serveStatic: false })

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/export",
      headers: {
        authorization: "Bearer admin-email-token",
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toContain("sighting-1")

    await app.close()
  })

  it("should reject non-admin users with 403", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "user-1",
      email: "user@example.com",
      role: "user",
    })

    const { buildApp } = await import("../../app")
    const app = await buildApp({ logger: false, serveStatic: false })

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/export",
      headers: {
        authorization: "Bearer user-token",
      },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: "Forbidden: not an authorized admin",
    })

    await app.close()
  })

  it("should return 404 when there is no data to export", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "admin-1",
      email: "calebchongsj@gmail.com",
      role: "admin",
    })
    mockWalksGet.mockResolvedValue({ docs: [] })
    mockSightingsGet.mockResolvedValue({
      docs: [],
    })
    mockParticipationsGet.mockResolvedValue({ docs: [] })

    const { buildApp } = await import("../../app")
    const app = await buildApp({ logger: false, serveStatic: false })

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/export",
      headers: {
        authorization: "Bearer admin-token",
      },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: "No data available for export",
    })

    await app.close()
  })

  it("should pass through filters and anonymization query params", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "admin-1",
      email: "calebchongsj@gmail.com",
      role: "admin",
    })
    mockWalksGet.mockResolvedValue({
      docs: [
        {
          id: "walk-1",
          data: () => ({
            walk_id: "walk-1",
            date_time: "2026-03-21T08:00:00.000Z",
            route_info: [[1.3, 103.8]],
            group_leader_id: "leader-1",
          }),
        },
      ],
    })
    mockSightingsGet.mockResolvedValue({
      docs: [
        {
          id: "sighting-1",
          data: () => ({
            sighting_id: "sighting-1",
            walk_id: "walk-1",
            adult_count: 2,
            juvenile_count: 1,
            infant_count: 1,
            behavior: "feeding",
            notes: "Mangrove edge",
            latitude: 1.3014,
            longitude: 103.8014,
            images_references: ["photo-1"],
            submission_status: "SUBMITTED",
            observation_timestamp: "2026-03-21T09:00:00.000Z",
          }),
        },
      ],
    })
    mockParticipationsGet.mockResolvedValue({ docs: [] })

    const { buildApp } = await import("../../app")
    const app = await buildApp({ logger: false, serveStatic: false })

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/export?walkId=walk-1&startDate=2026-03-01&endDate=2026-03-31&anonymize=true",
      headers: {
        authorization: "Bearer admin-token",
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toContain("sighting-1")
    expect(response.body).toContain(",1.301,103.801,1,")

    await app.close()
  })

  it("should reject unsupported formats", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "admin-1",
      email: "calebchongsj@gmail.com",
      role: "admin",
    })

    const { buildApp } = await import("../../app")
    const app = await buildApp({ logger: false, serveStatic: false })

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/export?format=xlsx",
      headers: {
        authorization: "Bearer admin-token",
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: "Unsupported export format. Only csv is currently available",
    })

    await app.close()
  })
})
