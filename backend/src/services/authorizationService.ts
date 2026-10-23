import { config } from "../config"
import { db } from "../lib/firebase-admin"
import { FIRESTORE_COLLECTIONS } from "../lib/firestore-collections"
import { AuthUser } from "../schemas/auth.schema"

type ParticipationDoc = {
  role?: string
}

type WalkDoc = {
  group_leader_id?: string | null
}

export async function isGroupLeader(userId: string, walkId: string): Promise<boolean> {
  const participationSnapshot = await db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("walk_id", "==", walkId)
    .where("user_id", "==", userId)
    .get()

  if (participationSnapshot.empty) {
    return false
  }

  // Supports a future participation role field while remaining compatible
  // with current model where group leader is stored on the walk document.
  const participationData = participationSnapshot.docs[0].data() as ParticipationDoc
  if (participationData.role === "GROUP_LEADER") {
    return true
  }

  const walkDoc = await db.collection(FIRESTORE_COLLECTIONS.WALKS).doc(walkId).get()
  if (!walkDoc.exists) {
    return false
  }

  const walkData = walkDoc.data() as WalkDoc
  return walkData.group_leader_id === userId
}

export async function isWalkParticipant(userId: string, walkId: string): Promise<boolean> {
  const snapshot = await db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("walk_id", "==", walkId)
    .where("user_id", "==", userId)
    .get()

  return !snapshot.empty
}

export function isAdmin(user: AuthUser): boolean {
  const isAdminRole = user.role === "admin"
  const email = user.email?.toLowerCase()
  const isAdminEmail =
    !!email && config.adminEmails.map((e) => e.toLowerCase()).includes(email)

  return isAdminRole || isAdminEmail
}
