import { AppError } from "../../lib/errors"
import { db, storage } from "../../lib/firebase-admin"
import { FIRESTORE_COLLECTIONS } from "../../lib/firestore-collections"

type ExportFormat = "csv"

export type ExportSurveyDataParams = {
  walkId?: string
  startDate?: string
  endDate?: string
  anonymize?: boolean
  format?: ExportFormat
}

export type ExportFile = {
  content: string
  contentType: string
  filename: string
}

type WalkExportRecord = {
  walk_id?: string
  date_time?: unknown
  route_info?: unknown
  route_points?: Array<{ lat: number; lng: number }>
  group_leader_id?: unknown
}

type ParticipationExportRecord = {
  walk_id?: string
}

type SightingExportRecord = {
  sighting_id?: string
  walk_id?: string
  adult_count?: unknown
  juvenile_count?: unknown
  infant_count?: unknown
  behavior?: unknown
  notes?: unknown
  latitude?: unknown
  longitude?: unknown
  images_references?: unknown
  submission_status?: unknown
  created_at?: unknown
  observation_timestamp?: unknown
}

type ExportRow = {
  walk_id: string
  walk_date: string
  group_leader_id: string
  group_size: string
  route_info: string
  sighting_id: string
  adult_count: string
  juvenile_count: string
  infant_count: string
  total_individuals: string
  has_infants: string
  species: string
  behavior: string
  notes: string
  latitude: string
  longitude: string
  image_count: string
  image_urls: string
  submission_status: string
  created_at: string
}

const CSV_COLUMNS: Array<keyof ExportRow> = [
  "walk_id",
  "walk_date",
  "group_leader_id",
  "group_size",
  "route_info",
  "sighting_id",
  "adult_count",
  "juvenile_count",
  "infant_count",
  "total_individuals",
  "has_infants",
  "species",
  "behavior",
  "notes",
  "latitude",
  "longitude",
  "image_count",
  "image_urls",
  "submission_status",
  "created_at",
]

const SIGNED_URL_DURATION_MS = 7 * 24 * 60 * 60 * 1000
const IMAGE_URL_SEPARATOR = " | "

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

function buildCsv(rows: ExportRow[]): string {
  const header = CSV_COLUMNS.join(",")
  const lines = rows.map((row) =>
    CSV_COLUMNS.map((column) => escapeCsvValue(row[column])).join(","),
  )

  return [header, ...lines].join("\n")
}

function toInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toStringValue(value: unknown): string {
  if (value == null) {
    return ""
  }

  return String(value)
}

function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    return ""
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const year = parsed.getUTCFullYear()
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
  const day = String(parsed.getUTCDate()).padStart(2, "0")
  const hours = String(parsed.getUTCHours()).padStart(2, "0")
  const minutes = String(parsed.getUTCMinutes()).padStart(2, "0")
  const seconds = String(parsed.getUTCSeconds()).padStart(2, "0")

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function parseFilterDate(value: string | undefined, field: "startDate" | "endDate"): Date | null {
  if (!value) {
    return null
  }

  const hasExplicitTime = value.includes("T") || /\d{2}:\d{2}/.test(value)
  const normalizedValue =
    field === "endDate" && !hasExplicitTime
      ? `${value}T23:59:59.999Z`
      : field === "startDate" && !hasExplicitTime
        ? `${value}T00:00:00.000Z`
        : value

  const parsed = new Date(normalizedValue)
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("BAD_REQUEST", 400, `Invalid ${field}`)
  }

  return parsed
}

function serializeRouteInfo(routeInfo: unknown, routePoints: WalkExportRecord["route_points"]): string {
  if (Array.isArray(routeInfo)) {
    return JSON.stringify(routeInfo)
  }

  if (Array.isArray(routePoints)) {
    return JSON.stringify(routePoints.map((point) => [point.lat, point.lng]))
  }

  return ""
}

function formatCoordinate(value: unknown, anonymize: boolean): string {
  const numericValue = toNumberOrNull(value)
  if (numericValue == null) {
    return ""
  }

  const finalValue = anonymize ? Number(numericValue.toFixed(3)) : numericValue
  return String(finalValue)
}

function toImageCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function toImageReferences(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
}

async function resolveImageUrl(reference: string): Promise<string> {
  if (reference.startsWith("https://")) {
    return reference
  }

  try {
    const [url] = await storage
      .bucket()
      .file(reference)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + SIGNED_URL_DURATION_MS,
      })

    return url
  } catch (error) {
    console.warn(
      `Failed to generate signed URL for image reference "${reference}"`,
      error,
    )
    return ""
  }
}

async function resolveImageUrls(references: string[]): Promise<string[]> {
  const urls = await Promise.all(references.map((reference) => resolveImageUrl(reference)))
  return urls.filter((url) => url !== "")
}

function formatImageUrls(urls: string[]): string {
  return urls.join(IMAGE_URL_SEPARATOR)
}

function getWalkDateForFilter(walk?: WalkExportRecord): Date | null {
  if (typeof walk?.date_time !== "string") {
    return null
  }

  const parsed = new Date(walk.date_time)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function exportSurveyData(
  params: ExportSurveyDataParams = {},
): Promise<ExportFile> {
  const format = params.format ?? "csv"
  if (format !== "csv") {
    throw new AppError(
      "BAD_REQUEST",
      400,
      "Unsupported export format. Only csv is currently available",
    )
  }

  const startDate = parseFilterDate(params.startDate, "startDate")
  const endDate = parseFilterDate(params.endDate, "endDate")
  if (startDate && endDate && startDate > endDate) {
    throw new AppError("BAD_REQUEST", 400, "startDate cannot be later than endDate")
  }

  const [walksSnapshot, sightingsSnapshot, participationsSnapshot] = await Promise.all([
    db.collection(FIRESTORE_COLLECTIONS.WALKS).get(),
    db.collection(FIRESTORE_COLLECTIONS.SIGHTINGS).get(),
    db.collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS).get(),
  ])

  const walksById = new Map<string, WalkExportRecord>()
  for (const walkDoc of walksSnapshot.docs) {
    const data = walkDoc.data() as WalkExportRecord
    const walkId = toStringValue(data.walk_id || walkDoc.id)
    walksById.set(walkId, data)
  }

  const participantCounts = new Map<string, number>()
  for (const participationDoc of participationsSnapshot.docs) {
    const participation = participationDoc.data() as ParticipationExportRecord
    const walkId = toStringValue(participation.walk_id)
    participantCounts.set(walkId, (participantCounts.get(walkId) ?? 0) + 1)
  }

  const rowsWithMetadata = await Promise.all(
    sightingsSnapshot.docs.map(async (doc) => {
      const sighting = doc.data() as SightingExportRecord
      const walkId = toStringValue(sighting.walk_id)
      const walk = walksById.get(walkId)
      const walkDate = getWalkDateForFilter(walk)
      const imageReferences = toImageReferences(sighting.images_references)
      const imageUrls = await resolveImageUrls(imageReferences)

      return {
        walkId,
        walk,
        walkDate,
        row: {
          walk_id: walkId,
          walk_date: formatDateTime(walk?.date_time),
          group_leader_id: toStringValue(walk?.group_leader_id),
          group_size: String(participantCounts.get(walkId) ?? 0),
          route_info: serializeRouteInfo(walk?.route_info, walk?.route_points),
          sighting_id: toStringValue(sighting.sighting_id || doc.id),
          adult_count: String(toInteger(sighting.adult_count)),
          juvenile_count: String(toInteger(sighting.juvenile_count)),
          infant_count: String(toInteger(sighting.infant_count)),
          total_individuals: String(
            toInteger(sighting.adult_count) +
              toInteger(sighting.juvenile_count) +
              toInteger(sighting.infant_count),
          ),
          has_infants: toInteger(sighting.infant_count) > 0 ? "1" : "0",
          species: "Raffles Banded Langur",
          behavior: toStringValue(sighting.behavior),
          notes: toStringValue(sighting.notes),
          latitude: formatCoordinate(sighting.latitude, params.anonymize ?? false),
          longitude: formatCoordinate(sighting.longitude, params.anonymize ?? false),
          image_count: String(toImageCount(sighting.images_references)),
          image_urls: formatImageUrls(imageUrls),
          submission_status: toStringValue(sighting.submission_status),
          created_at: formatDateTime(sighting.created_at ?? sighting.observation_timestamp),
        },
      }
    }),
  )

  const rows: ExportRow[] = rowsWithMetadata
    .filter(({ walkId, walkDate }) => {
      if (params.walkId && walkId !== params.walkId) {
        return false
      }

      if (startDate && (!walkDate || walkDate < startDate)) {
        return false
      }

      if (endDate && (!walkDate || walkDate > endDate)) {
        return false
      }

      return true
    })
    .sort((left, right) => {
      const byWalkDate = left.row.walk_date.localeCompare(right.row.walk_date)
      if (byWalkDate !== 0) {
        return byWalkDate
      }

      const byWalkId = left.row.walk_id.localeCompare(right.row.walk_id)
      if (byWalkId !== 0) {
        return byWalkId
      }

      return left.row.sighting_id.localeCompare(right.row.sighting_id)
    })
    .map(({ row }) => row)

  if (rows.length === 0) {
    throw new AppError("NOT_FOUND", 404, "No data available for export")
  }

  return {
    content: buildCsv(rows),
    contentType: "text/csv",
    filename: "survey_data.csv",
  }
}
