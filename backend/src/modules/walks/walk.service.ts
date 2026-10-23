import { v4 as uuidv4 } from "uuid"
import { Walk, WalkDetailForApi, WalkStatus } from "./walk.types"
import * as walkRepo from "./walk.repository"
import { auth, db } from "../../lib/firebase-admin"
import { deleteParticipationsByWalk, listParticipationsByWalk } from "../participation/participation.repository"
import { batchGetUserDisabledByUid } from "../participation/participation.service"
import { FIRESTORE_COLLECTIONS } from "../../lib/firestore-collections"
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors"
import { notifyWalkCancelledByAdmin } from "../../services/walk-notification.service"

type Weekday =
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"

type WalkCreateInput = {
  route_info: [number, number][]
  date_time: string
  scheduled_end_time?: string | null
  max_slots: number
  name?: string
}

type WalkRecurrenceInput = {
  repeat_weekday: Weekday
  end_date: string
}

const WEEKDAY_TO_INDEX: Record<Weekday, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
}

function defaultEndTime(startIso: string): string {
  const d = new Date(startIso)
  d.setHours(d.getHours() + 2)
  return d.toISOString()
}

function currentMinute(): Date {
  const now = new Date()
  now.setSeconds(0, 0)
  return now
}

function assertStartTimeIsNotInPast(startIso: string) {
  const scheduledStart = new Date(startIso)
  if (Number.isNaN(scheduledStart.getTime())) {
    throw new BadRequestError("Walk start time is invalid")
  }
  if (scheduledStart < currentMinute()) {
    throw new BadRequestError("Walk start time cannot be in the past")
  }
}

function parseDateOnly(dateOnly: string): Date {
  const parsed = new Date(`${dateOnly}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError("Recurring walk end date is invalid")
  }
  return parsed
}

function assertValidDate(date: Date, message: string) {
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError(message)
  }
}

function formatDateOnlyLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function extractTimePortion(dateTime: string): string {
  const match = dateTime.match(/T(\d{2}:\d{2})(?::(\d{2}))?/)
  if (!match) {
    throw new BadRequestError("Walk start time is invalid")
  }
  return `${match[1]}:${match[2] ?? "00"}`
}

function buildDateTimeOnDate(dateOnly: string, sourceDateTime: string): string {
  return `${dateOnly}T${extractTimePortion(sourceDateTime)}`
}

function buildRecurringWalkInputs(
  data: WalkCreateInput,
  recurrence?: WalkRecurrenceInput,
): WalkCreateInput[] {
  if (!recurrence) {
    return [data]
  }

  const start = new Date(data.date_time)
  assertValidDate(start, "Walk start time is invalid")
  parseDateOnly(recurrence.end_date)
  const startDateOnly = formatDateOnlyLocal(start)
  const repeatWeekdayIndex = WEEKDAY_TO_INDEX[recurrence.repeat_weekday]

  if (start.getDay() !== repeatWeekdayIndex) {
    throw new BadRequestError("Walk start date must match the selected repeat day")
  }
  if (startDateOnly > recurrence.end_date) {
    throw new BadRequestError("Recurring walk end date must be on or after the start date")
  }

  const inputs: WalkCreateInput[] = []
  const cursor = new Date(start)

  while (formatDateOnlyLocal(cursor) <= recurrence.end_date) {
    const occurrenceDateOnly = formatDateOnlyLocal(cursor)
    inputs.push({
      ...data,
      date_time: buildDateTimeOnDate(occurrenceDateOnly, data.date_time),
      scheduled_end_time:
        data.scheduled_end_time != null && String(data.scheduled_end_time).trim() !== ""
          ? buildDateTimeOnDate(occurrenceDateOnly, data.scheduled_end_time)
          : null,
    })
    cursor.setDate(cursor.getDate() + 7)
  }

  return inputs
}

async function createSingleWalk(data: WalkCreateInput): Promise<Walk> {
  assertStartTimeIsNotInPast(data.date_time)

  const scheduled_end_time =
    data.scheduled_end_time && data.scheduled_end_time.trim() !== ""
      ? data.scheduled_end_time
      : defaultEndTime(data.date_time)

  const walk: Walk = {
    walk_id: uuidv4(),
    route_info: data.route_info,
    date_time: data.date_time,
    scheduled_end_time,
    max_slots: data.max_slots,
    group_leader_id: null,
    status: WalkStatus.UPCOMING,
    has_sightings: false,
    name: data.name ?? "",
  }

  return walkRepo.createWalk(walk)
}

export async function createWalk(data: WalkCreateInput): Promise<Walk> {
  return createSingleWalk(data)
}

export async function createWalks(
  data: WalkCreateInput & { recurrence?: WalkRecurrenceInput },
): Promise<Walk[]> {
  const occurrences = buildRecurringWalkInputs(data, data.recurrence)
  return Promise.all(occurrences.map((occurrence) => createSingleWalk(occurrence)))
}

export async function getWalkById(walkId: string) {
  const walk = await walkRepo.getWalkById(walkId)
  if (!walk) return null

  // Auto-close stale walks so old scheduled walks don't stay "open" in the UI
  // or allow operations in later years.
  //
  // Rules (UTC):
  // - UPCOMING walks auto-close at end-of-day of their scheduled start (`date_time`)
  // - IN_PROGRESS walks auto-close at end-of-day of their actual start (`started_at`)
  const now = new Date()
  if (walk.status === WalkStatus.IN_PROGRESS) {
    const startedIso = walk.started_at ?? walk.date_time
    const closesAt = endOfDayUTC(startedIso)
    if (now > closesAt) {
      const updated = await walkRepo.updateWalkStatusAndTimestamps(walkId, {
        status: WalkStatus.COMPLETED,
        ended_at: closesAt.toISOString(),
      })
      return updated ?? walk
    }
  }

  if (walk.status === WalkStatus.UPCOMING) {
    const closesAt = endOfDayUTC(walk.date_time)
    if (now > closesAt) {
      const updated = await walkRepo.updateWalkStatusAndTimestamps(walkId, {
        status: WalkStatus.ABANDONED,
        ended_at: closesAt.toISOString(),
      })
      return updated ?? walk
    }
  }

  return walk
}

async function displayNameForUserId(userId: string): Promise<string> {
  try {
    const u = await auth.getUser(userId)
    const fromProfile = u.displayName?.trim()
    if (fromProfile) return fromProfile
    const email = u.email
    if (email) {
      const local = email.split("@")[0]?.trim()
      if (local) return local
    }
  } catch {
    // deleted or unknown user
  }
  return "Volunteer"
}

/**
 * Walk by id with participant summary for GET /api/walks/:id (any authenticated user).
 */
export async function getWalkDetailForApi(walkId: string): Promise<WalkDetailForApi | null> {
  const walk = await getWalkById(walkId)
  if (!walk) return null

  const participations = await listParticipationsByWalk(walkId)
  const current_participant_count = participations.length
  const leaderId = walk.group_leader_id

  const uniqueUserIds = [...new Set(participations.map((p) => p.user_id))]
  const nameByUserId: Record<string, string> = {}
  await Promise.all(
    uniqueUserIds.map(async (uid) => {
      nameByUserId[uid] = await displayNameForUserId(uid)
    }),
  )

  const disabledByUid = await batchGetUserDisabledByUid(uniqueUserIds)

  const participants = participations
    .map((p) => ({
      user_id: p.user_id,
      display_name: nameByUserId[p.user_id] ?? "Volunteer",
      is_designated_submitter: Boolean(leaderId && p.user_id === leaderId),
      disabled: disabledByUid[p.user_id] ?? true,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  return {
    ...walk,
    current_participant_count,
    participants,
  }
}

export async function listWalks() {
  const walks = await walkRepo.listWalks()
  const participationSnapshot = await db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .get()

  const participantCountsByWalkId = new Map<string, number>()
  for (const doc of participationSnapshot.docs) {
    const data = doc.data() as { walk_id?: string; attendance_status?: string }
    if (
      !data.walk_id ||
      (data.attendance_status !== "REGISTERED" && data.attendance_status !== "ATTENDED")
    ) {
      continue
    }
    participantCountsByWalkId.set(
      data.walk_id,
      (participantCountsByWalkId.get(data.walk_id) ?? 0) + 1,
    )
  }

  const now = new Date()
  const resolvedWalks = await Promise.all(
    walks.map(async (walk) => {
      if (walk.status === WalkStatus.IN_PROGRESS) {
        const startedIso = walk.started_at ?? walk.date_time
        const closesAt = endOfDayUTC(startedIso)
        if (now > closesAt) {
          return (
            await walkRepo.updateWalkStatusAndTimestamps(walk.walk_id, {
              status: WalkStatus.COMPLETED,
              ended_at: closesAt.toISOString(),
            })
          ) ?? walk
        }
      }

      if (walk.status === WalkStatus.UPCOMING) {
        const closesAt = endOfDayUTC(walk.date_time)
        if (now > closesAt) {
          return (
            await walkRepo.updateWalkStatusAndTimestamps(walk.walk_id, {
              status: WalkStatus.ABANDONED,
              ended_at: closesAt.toISOString(),
            })
          ) ?? walk
        }
      }

      return walk
    }),
  )

  return resolvedWalks.map((walk) => ({
    ...walk,
    current_participant_count: participantCountsByWalkId.get(walk.walk_id) ?? 0,
  }))
}

export async function updateWalk(
  walkId: string,
  data: {
    route_info: [number, number][]
    date_time: string
    scheduled_end_time?: string | null
    max_slots: number
    name?: string
  },
) {
  assertStartTimeIsNotInPast(data.date_time)

  // Guard: don't let admin shrink slots below current participant count
  const participantsSnapshot = await db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("walk_id", "==", walkId)
    .get()

  const currentCount = participantsSnapshot.size
  if (data.max_slots < currentCount) {
    throw new BadRequestError(
      `Cannot reduce max slots to ${data.max_slots}: walk already has ${currentCount} registered participant(s)`
    )
  }

  const startTime = data.date_time
  const scheduled_end_time =
    data.scheduled_end_time != null && String(data.scheduled_end_time).trim() !== ""
      ? data.scheduled_end_time
      : defaultEndTime(startTime)

  return walkRepo.updateWalk(walkId, {
    ...data,
    scheduled_end_time,
  })
}

export async function deleteWalk(walkId: string): Promise<boolean> {
  const [walk, participations] = await Promise.all([
    walkRepo.getWalkById(walkId),
    listParticipationsByWalk(walkId),
  ])

  if (!walk) {
    return false
  }

  const deleted = await walkRepo.deleteWalk(walkId)
  if (!deleted) {
    return false
  }

  await deleteParticipationsByWalk(walkId)

  try {
    await notifyWalkCancelledByAdmin({
      walkId: walk.walk_id,
      walkName: walk.name,
      walkDateTime: walk.date_time,
      participantIds: participations.map((participation) => participation.user_id),
    })
  } catch (error) {
    console.error("Failed to send admin walk-cancel notifications", error)
  }

  return true
}

function endOfDayUTC(iso: string): Date {
  const d = new Date(iso)
  const ymd = d.toISOString().slice(0, 10) // YYYY-MM-DD in UTC
  // Close at 23:59:59.999Z of the started day
  return new Date(`${ymd}T23:59:59.999Z`)
}

export async function startWalk(walkId: string): Promise<Walk> {
  const walk = await walkRepo.getWalkById(walkId)
  if (!walk) {
    throw new NotFoundError("Walk", walkId)
  }
  if (walk.status !== WalkStatus.UPCOMING) {
    throw new ConflictError("Walk is not in UPCOMING status")
  }
  const now = new Date()
  const scheduledStart = new Date(walk.date_time)
  if (now < scheduledStart) {
    throw new BadRequestError("Walk cannot be started before its scheduled time")
  }
  // Upper bound for starting: must start on the scheduled day.
  const startClosesAt = endOfDayUTC(walk.date_time)
  if (now > startClosesAt) {
    throw new BadRequestError("Walk cannot be started after the scheduled day has ended")
  }
  const updated = await walkRepo.updateWalkStatusAndTimestamps(walkId, {
    status: WalkStatus.IN_PROGRESS,
    started_at: now.toISOString(),
  })
  if (!updated) {
    throw new NotFoundError("Walk", walkId)
  }
  return updated
}

export async function endWalk(walkId: string): Promise<Walk> {
  const walk = await walkRepo.getWalkById(walkId)
  if (!walk) {
    throw new NotFoundError("Walk", walkId)
  }
  if (walk.status !== WalkStatus.IN_PROGRESS) {
    throw new ConflictError("Walk is not in progress")
  }
  const now = new Date()
  const updated = await walkRepo.updateWalkStatusAndTimestamps(walkId, {
    status: WalkStatus.COMPLETED,
    ended_at: now.toISOString(),
  })
  if (!updated) {
    throw new NotFoundError("Walk", walkId)
  }
  return updated
}
