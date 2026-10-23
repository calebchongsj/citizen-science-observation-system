import { db } from "../../lib/firebase-admin";
import { FIRESTORE_COLLECTIONS } from "../../lib/firestore-collections";
import {
  Participation,
  CreateParticipationInput
} from "./participation.types";

export async function createParticipation(
  input: CreateParticipationInput
): Promise<Participation> {

  const docRef = db.collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS).doc();

  const participation: Participation = {
    participation_id: docRef.id,
    walk_id: input.walk_id,
    user_id: input.user_id,
    attendance_status: "REGISTERED",
    created_at: Date.now()
  };

  await docRef.set(participation);

  return participation;
}

export async function deleteParticipation(
  participationId: string
): Promise<void> {

  await db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .doc(participationId)
    .delete();
}

export async function deleteParticipationsByWalk(
  walkId: string
): Promise<void> {

  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("walk_id", "==", walkId)
    .get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}

export async function listParticipationsByWalk(
  walkId: string
): Promise<Participation[]> {

  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("walk_id", "==", walkId)
    .get();

  return snapshot.docs.map(doc => doc.data() as Participation);
}

export async function listParticipationsByUser(
  userId: string
): Promise<Participation[]> {

  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("user_id", "==", userId)
    .get();

  return snapshot.docs.map(doc => doc.data() as Participation);
}
