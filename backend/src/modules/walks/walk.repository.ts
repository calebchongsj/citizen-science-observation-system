import { db } from "../../lib/firebase-admin"
import { FIRESTORE_COLLECTIONS } from "../../lib/firestore-collections"
import { Walk } from "./walk.types"

/** Firestore does not support array-of-arrays; store route as route_points: [{ lat, lng }, ...] */
type WalkDoc = Omit<Walk, "route_info"> & {
  route_points: Array<{ lat: number; lng: number }>
}

function toDoc(walk: Walk): WalkDoc {
  const { route_info, ...rest } = walk
  return {
    ...rest,
    route_points: route_info.map(([lat, lng]) => ({ lat, lng })),
  }
}

function fromDoc(data: WalkDoc & { route_info?: [number, number][]; name?: string }): Walk {
  const { route_points, route_info: legacy, name, ...rest } = data
  const route_info =
    legacy ??
    (route_points || []).map((p) => [p.lat, p.lng] as [number, number])
  return { ...rest, route_info, name: name ?? "" }
}

export async function createWalk(walk: Walk): Promise<Walk> {
  const docRef = db.collection(FIRESTORE_COLLECTIONS.WALKS).doc(walk.walk_id)
  await docRef.set(toDoc(walk))
  return walk
}

export async function getWalkById(walkId: string): Promise<Walk | null> {
  const doc = await db.collection(FIRESTORE_COLLECTIONS.WALKS).doc(walkId).get()
  if (!doc.exists) {
    return null
  }
  return fromDoc(doc.data() as WalkDoc)
}

export async function listWalks(): Promise<Walk[]> {
  const snapshot = await db.collection(FIRESTORE_COLLECTIONS.WALKS).get()
  return snapshot.docs.map((doc) => fromDoc(doc.data() as WalkDoc))
}

export async function updateWalk(
  walkId: string,
  data: {
    route_info: [number, number][]
    date_time: string
    scheduled_end_time?: string
    max_slots: number
    name?: string
  },
): Promise<Walk | null> {
  const docRef = db.collection(FIRESTORE_COLLECTIONS.WALKS).doc(walkId)
  const doc = await docRef.get()
  if (!doc.exists) {
    return null
  }
  const existing = fromDoc(doc.data() as WalkDoc)
  const updated: Walk = {
    ...existing,
    route_info: data.route_info,
    date_time: data.date_time,
    max_slots: data.max_slots,
    scheduled_end_time: data.scheduled_end_time,
    ...(data.name !== undefined && { name: data.name }),
  }
  await docRef.set(toDoc(updated))
  return updated
}

export async function updateWalkStatusAndTimestamps(
  walkId: string,
  updates: { status: Walk["status"]; started_at?: string; ended_at?: string },
): Promise<Walk | null> {
  const docRef = db.collection(FIRESTORE_COLLECTIONS.WALKS).doc(walkId)
  const doc = await docRef.get()
  if (!doc.exists) {
    return null
  }
  const existing = fromDoc(doc.data() as WalkDoc)
  const updated: Walk = {
    ...existing,
    status: updates.status,
    ...(updates.started_at !== undefined && { started_at: updates.started_at }),
    ...(updates.ended_at !== undefined && { ended_at: updates.ended_at }),
  }
  await docRef.set(toDoc(updated))
  return updated
}

export async function deleteWalk(walkId: string): Promise<boolean> {
  const docRef = db.collection(FIRESTORE_COLLECTIONS.WALKS).doc(walkId)
  const doc = await docRef.get()
  if (!doc.exists) {
    return false
  }
  await docRef.delete()
  return true
}