import { db } from "../../lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import { FIRESTORE_COLLECTIONS } from "../../lib/firestore-collections"
import { config } from "../../config"
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors"
import { WalkStatus } from "../walks/walk.types"
import { Sighting } from "./sighting.types"
import * as sightingRepo from "./sighting.repository"

type CreateSightingInput = Omit<
  Sighting,
  | "sighting_id"
  | "walk_id"
  | "recorded_by_user_id"
  | "submission_status"
  | "observation_timestamp"
  | "last_edited_at"
> & {
  observation_timestamp?: string
}

type UpdateSightingDraftInput = Partial<
  Omit<Sighting, "sighting_id" | "walk_id" | "recorded_by_user_id" | "submission_status" | "last_edited_at">
>

function isAdmin(role: string | undefined, email: string | undefined): boolean {
  const isAdminRole = role === "admin"
  const isAdminEmail =
    !!email && config.adminEmails.map((e) => e.toLowerCase()).includes(email.toLowerCase())
  return isAdminRole || isAdminEmail
}

function endedAtPlus2Hours(endedAtIso: string): Date {
  const d = new Date(endedAtIso)
  d.setHours(d.getHours() + 2)
  return d
}

function endOfDayUTC(iso: string): Date {
  const d = new Date(iso)
  const ymd = d.toISOString().slice(0, 10) // YYYY-MM-DD in UTC
  return new Date(`${ymd}T23:59:59.999Z`)
}

async function assertWalkExistsAndLeader(walkId: string, userId: string) {
  const walkDoc = await db
    .collection(FIRESTORE_COLLECTIONS.WALKS)
    .doc(walkId)
    .get()

  if (!walkDoc.exists) {
    throw new NotFoundError("Walk", walkId)
  }

  const walkData = walkDoc.data() as {
    group_leader_id: string | null
    status: WalkStatus
    ended_at?: string
    started_at?: string
    date_time: string
    scheduled_end_time?: string
  }

  if (walkData.group_leader_id !== userId) {
    throw new ForbiddenError("Only the designated group leader can manage sightings for this walk")
  }

  const now = new Date()
  const inProgressClosesAt = endOfDayUTC(walkData.started_at ?? walkData.date_time)

  // Recording window:
  // - While IN_PROGRESS: until end-of-day of started_at.
  // - After COMPLETED: within 2 hours of ended_at.
  const canAddSighting =
    (walkData.status === WalkStatus.IN_PROGRESS && now <= inProgressClosesAt) ||
    (walkData.status === WalkStatus.COMPLETED &&
      walkData.ended_at != null &&
      now <= endedAtPlus2Hours(walkData.ended_at))

  if (!canAddSighting) {
    throw new ConflictError(
      "Sightings can only be recorded while the walk is in progress (until end of day), or within 2 hours after it has ended"
    )
  }

  return walkData
}

async function assertUserIsParticipantOrAdmin(params: {
  walkId: string
  userId: string
  role?: string
  email?: string
}) {
  const { walkId, userId, role, email } = params

  if (isAdmin(role, email)) {
    return
  }

  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("walk_id", "==", walkId)
    .where("user_id", "==", userId)
    .get()

  const isParticipant = !snapshot.empty

  if (!isParticipant) {
    throw new ForbiddenError("User is not a participant of this walk")
  }
}

export async function createSightingForWalk(params: {
  walkId: string
  userId: string
  input: CreateSightingInput
}): Promise<Sighting> {
  await assertWalkExistsAndLeader(params.walkId, params.userId)

  const payload: Omit<Sighting, "sighting_id"> = {
    walk_id: params.walkId,
    recorded_by_user_id: params.userId,
    submission_status: "DRAFT",
    ...params.input,
    observation_timestamp: params.input.observation_timestamp ?? new Date().toISOString(),
    last_edited_at: new Date().toISOString(),
  }

  return sightingRepo.createSighting(payload)
}

export async function updateSightingDraft(params: {
  walkId: string
  sightingId: string
  userId: string
  input: UpdateSightingDraftInput
}): Promise<Sighting> {
  const existing = await sightingRepo.getSightingById(params.sightingId)

  if (!existing) {
    throw new NotFoundError("Sighting", params.sightingId)
  }

  if (existing.submission_status !== "DRAFT") {
    throw new ConflictError("Submitted sightings cannot be edited")
  }

  if (existing.walk_id !== params.walkId) {
    throw new NotFoundError("Sighting", params.sightingId)
  }

  await assertWalkExistsAndLeader(existing.walk_id, params.userId)

  const allowedUpdates: UpdateSightingDraftInput = {
    adult_count: params.input.adult_count ?? existing.adult_count,
    juvenile_count: params.input.juvenile_count ?? existing.juvenile_count,
    infant_count: params.input.infant_count ?? existing.infant_count,
    behavior: params.input.behavior ?? existing.behavior,
    notes: params.input.notes ?? existing.notes,
    images_references: params.input.images_references ?? existing.images_references,
    observation_timestamp:
      params.input.observation_timestamp ?? existing.observation_timestamp,
    latitude: params.input.latitude ?? existing.latitude,
    longitude: params.input.longitude ?? existing.longitude,
  }

  const docRef = db.collection(FIRESTORE_COLLECTIONS.SIGHTINGS).doc(params.sightingId)
  const updated: Sighting = {
    ...existing,
    ...allowedUpdates,
    last_edited_at: new Date().toISOString(),
  }

  await docRef.set(updated)

  return updated
}

export async function deleteSighting(params: {
  walkId: string
  sightingId: string
  userId: string
}): Promise<void> {
  const existing = await sightingRepo.getSightingById(params.sightingId)

  if (!existing) {
    throw new NotFoundError("Sighting", params.sightingId)
  }

  if (existing.submission_status !== "DRAFT") {
    throw new ConflictError("Only draft sightings can be deleted")
  }

  if (existing.walk_id !== params.walkId) {
    throw new NotFoundError("Sighting", params.sightingId)
  }

  await assertWalkExistsAndLeader(existing.walk_id, params.userId)

  const deleted = await sightingRepo.deleteSighting(params.sightingId)
  if (!deleted) {
    throw new NotFoundError("Sighting", params.sightingId)
  }
}

export async function submitSighting(params: {
  walkId: string
  sightingId: string
  userId: string
}): Promise<Sighting> {
  const existing = await sightingRepo.getSightingById(params.sightingId)

  if (!existing) {
    throw new NotFoundError("Sighting", params.sightingId)
  }

  if (existing.submission_status !== "DRAFT") {
    throw new ConflictError("Only draft sightings can be submitted")
  }

  if (existing.walk_id !== params.walkId) {
    throw new NotFoundError("Sighting", params.sightingId)
  }

  await assertWalkExistsAndLeader(existing.walk_id, params.userId)

  const docRef = db.collection(FIRESTORE_COLLECTIONS.SIGHTINGS).doc(params.sightingId)
  const updated: Sighting = {
    ...existing,
    submission_status: "SUBMITTED",
    last_edited_at: new Date().toISOString(),
  }

  await docRef.set(updated)

  return updated
}

export async function listSightingsForWalk(params: {
  walkId: string
  userId: string
  role?: string
  email?: string
}): Promise<Sighting[]> {
  await assertUserIsParticipantOrAdmin({
    walkId: params.walkId,
    userId: params.userId,
    role: params.role,
    email: params.email,
  })

  const list = await sightingRepo.listSightingsByWalk(params.walkId)
  return list.map((s) => ({
    ...s,
    // Backfill for older docs that may not have last_edited_at yet.
    last_edited_at: s.last_edited_at ?? s.observation_timestamp,
  }))
}

export async function addImageReference(params: {
  walkId: string
  sightingId: string
  userId: string
  imageUrl: string
}): Promise<Sighting> {
  const existing = await sightingRepo.getSightingById(params.sightingId)

  if (!existing) {
    throw new NotFoundError("Sighting", params.sightingId)
  }

  if (existing.walk_id !== params.walkId) {
    throw new NotFoundError("Sighting", params.sightingId)
  }

  if (existing.submission_status !== "DRAFT") {
    throw new ConflictError("Cannot add image to submitted sighting")
  }

  await assertWalkExistsAndLeader(existing.walk_id, params.userId)

  await db.collection(FIRESTORE_COLLECTIONS.SIGHTINGS).doc(params.sightingId).update({
    images_references: FieldValue.arrayUnion(params.imageUrl),
    last_edited_at: new Date().toISOString(),
  })

  const updated = await sightingRepo.getSightingById(params.sightingId)
  if (!updated) {
    throw new NotFoundError("Sighting", params.sightingId)
  }

  return updated
}
