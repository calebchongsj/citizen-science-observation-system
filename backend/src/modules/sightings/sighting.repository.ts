import { db } from "../../lib/firebase-admin"
import { FIRESTORE_COLLECTIONS } from "../../lib/firestore-collections"
import { Sighting } from "./sighting.types"

export async function createSighting(
  data: Omit<Sighting, "sighting_id">,
): Promise<Sighting> {
  const docRef = db.collection(FIRESTORE_COLLECTIONS.SIGHTINGS).doc()

  const sighting: Sighting = {
    sighting_id: docRef.id,
    ...data,
  }

  await docRef.set(sighting)

  return sighting
}

export async function getSightingById(
  sightingId: string,
): Promise<Sighting | null> {
  const doc = await db
    .collection(FIRESTORE_COLLECTIONS.SIGHTINGS)
    .doc(sightingId)
    .get()

  if (!doc.exists) {
    return null
  }

  return doc.data() as Sighting
}

export async function listSightingsByWalk(walkId: string): Promise<Sighting[]> {
  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.SIGHTINGS)
    .where("walk_id", "==", walkId)
    .get()

  return snapshot.docs.map((doc) => doc.data() as Sighting)
}

export async function deleteSighting(sightingId: string): Promise<boolean> {
  const docRef = db.collection(FIRESTORE_COLLECTIONS.SIGHTINGS).doc(sightingId)
  const doc = await docRef.get()
  if (!doc.exists) {
    return false
  }
  await docRef.delete()
  return true
}

