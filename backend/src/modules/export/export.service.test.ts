import { beforeEach, describe, expect, it, vi } from "vitest"
import { exportSurveyData } from "./export.service"

const mockWalksGet = vi.fn()
const mockSightingsGet = vi.fn()
const mockParticipationsGet = vi.fn()
const mockGetSignedUrl = vi.fn()

vi.mock("../../lib/firebase-admin", () => ({
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
        getSignedUrl: (options: unknown) => mockGetSignedUrl(path, options),
      }),
    }),
  },
}))

describe("exportSurveyData", () => {
  beforeEach(() => {
    mockWalksGet.mockReset()
    mockSightingsGet.mockReset()
    mockParticipationsGet.mockReset()
    mockGetSignedUrl.mockReset()
  })

  it("should return enriched CSV rows for every sighting", async () => {
    mockGetSignedUrl.mockImplementation(async (path: string) => [`https://signed.example/${path}`])
    mockWalksGet.mockResolvedValue({
      docs: [
        {
          id: "walk-1",
          data: () => ({
            walk_id: "walk-1",
            date_time: "2026-03-21T08:00:00.000Z",
            route_info: [
              [1.3, 103.8],
              [1.31, 103.81],
            ],
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
          id: "sighting-2",
          data: () => ({
            sighting_id: "sighting-2",
            walk_id: "walk-1",
            adult_count: 1,
            juvenile_count: 0,
            infant_count: 0,
            behavior: "resting",
            notes: "Includes, comma",
            latitude: 1.305,
            longitude: 103.805,
            images_references: ["a.jpg", "https://cdn.example/b.jpg"],
            submission_status: "SUBMITTED",
            observation_timestamp: "2026-03-21T09:05:00.000Z",
          }),
        },
        {
          id: "sighting-1",
          data: () => ({
            sighting_id: "sighting-1",
            walk_id: "walk-1",
            adult_count: 3,
            juvenile_count: 1,
            infant_count: 0,
            behavior: "feeding",
            notes: "Near boardwalk",
            latitude: 1.304,
            longitude: 103.804,
            images_references: ["images/sightings/a.jpg"],
            submission_status: "DRAFT",
            created_at: "2026-03-21T09:00:00.000Z",
          }),
        },
      ],
    })
    mockParticipationsGet.mockResolvedValue({
      docs: [
        { data: () => ({ walk_id: "walk-1" }) },
        { data: () => ({ walk_id: "walk-1" }) },
        { data: () => ({ walk_id: "walk-1" }) },
      ],
    })

    const file = await exportSurveyData()
    const csv = file.content

    expect(csv).toContain(
      "walk_id,walk_date,group_leader_id,group_size,route_info,sighting_id,adult_count,juvenile_count,infant_count,total_individuals,has_infants,species,behavior,notes,latitude,longitude,image_count,image_urls,submission_status,created_at",
    )
    expect(file.contentType).toBe("text/csv")
    expect(file.filename).toBe("survey_data.csv")
    expect(csv).toContain('walk-1,2026-03-21 08:00:00,leader-1,3,"[[1.3,103.8],[1.31,103.81]]",sighting-1,3,1,0,4,0,Raffles Banded Langur,feeding,Near boardwalk,1.304,103.804,1,https://signed.example/images/sightings/a.jpg,DRAFT,2026-03-21 09:00:00')
    expect(csv).toContain('walk-1,2026-03-21 08:00:00,leader-1,3,"[[1.3,103.8],[1.31,103.81]]",sighting-2,1,0,0,1,0,Raffles Banded Langur,resting,"Includes, comma",1.305,103.805,2,https://signed.example/a.jpg | https://cdn.example/b.jpg,SUBMITTED,2026-03-21 09:05:00')
    expect(csv.indexOf("sighting-1")).toBeLessThan(csv.indexOf("sighting-2"))
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      "images/sightings/a.jpg",
      expect.objectContaining({ action: "read" }),
    )
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      "a.jpg",
      expect.objectContaining({ action: "read" }),
    )
  })

  it("should support filtering and anonymized coordinates", async () => {
    mockGetSignedUrl.mockResolvedValue(["https://signed.example/image.jpg"])
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
        {
          id: "walk-2",
          data: () => ({
            walk_id: "walk-2",
            date_time: "2026-04-02T08:00:00.000Z",
            route_info: [[1.31, 103.81]],
            group_leader_id: "leader-2",
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
            adult_count: 1,
            juvenile_count: 0,
            infant_count: 1,
            behavior: "feeding",
            notes: "filtered row",
            latitude: 1.30449,
            longitude: 103.80449,
            images_references: [],
            submission_status: "SUBMITTED",
            observation_timestamp: "2026-03-21T09:00:00.000Z",
          }),
        },
        {
          id: "sighting-2",
          data: () => ({
            sighting_id: "sighting-2",
            walk_id: "walk-2",
            adult_count: 2,
            juvenile_count: 1,
            infant_count: 0,
            behavior: "resting",
            notes: "other row",
            latitude: 1.3999,
            longitude: 103.8999,
            images_references: [],
            submission_status: "DRAFT",
            observation_timestamp: "2026-04-02T09:00:00.000Z",
          }),
        },
      ],
    })
    mockParticipationsGet.mockResolvedValue({ docs: [] })

    const file = await exportSurveyData({
      walkId: "walk-1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      anonymize: true,
    })

    expect(file.content).toContain("sighting-1")
    expect(file.content).not.toContain("sighting-2")
    expect(file.content).toContain(",1.304,103.804,")
    expect(file.content).toContain(",2,1,Raffles Banded Langur,")
  })

  it("should skip invalid image paths without crashing", async () => {
    mockGetSignedUrl.mockImplementation(async (path: string) => {
      if (path === "broken/path.jpg") {
        throw new Error("missing object")
      }

      return [`https://signed.example/${path}`]
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
            adult_count: 1,
            juvenile_count: 0,
            infant_count: 0,
            behavior: "feeding",
            notes: "one good one bad",
            latitude: 1.3,
            longitude: 103.8,
            images_references: ["broken/path.jpg", "https://cdn.example/good.jpg"],
            submission_status: "SUBMITTED",
            observation_timestamp: "2026-03-21T09:00:00.000Z",
          }),
        },
      ],
    })
    mockParticipationsGet.mockResolvedValue({ docs: [] })

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const file = await exportSurveyData()

    expect(file.content).toContain("https://cdn.example/good.jpg")
    expect(file.content).not.toContain("broken/path.jpg")
    expect(warnSpy).toHaveBeenCalledOnce()

    warnSpy.mockRestore()
  })

  it("should throw a not found error when there are no sightings", async () => {
    mockWalksGet.mockResolvedValue({ docs: [] })
    mockSightingsGet.mockResolvedValue({
      docs: [],
    })
    mockParticipationsGet.mockResolvedValue({ docs: [] })

    await expect(exportSurveyData()).rejects.toMatchObject({
      statusCode: 404,
      message: "No data available for export",
    })
  })

  it("should reject invalid date filters", async () => {
    await expect(exportSurveyData({ startDate: "not-a-date" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid startDate",
    })
  })
})
