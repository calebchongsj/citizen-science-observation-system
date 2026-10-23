import { auth, db } from "../../lib/firebase-admin";
import { FIRESTORE_COLLECTIONS } from "../../lib/firestore-collections";
import {
  cancelWalkReminderForParticipation,
  notifyLateWalkCancellation,
  notifyWalkSignup,
} from "../../services/walk-notification.service";
import * as walkRepo from "../walks/walk.repository";
import { Walk, WalkStatus } from "../walks/walk.types";
import { CreateParticipationInput, Participation } from "./participation.types";
import { listParticipationsByUser, listParticipationsByWalk } from "./participation.repository";

function walkCalendarDay(dateTime: unknown): string | null {
  if (typeof dateTime !== "string" || dateTime.length < 10) {
    return null;
  }
  return dateTime.slice(0, 10);
}

export async function signUpForWalk(
  input: CreateParticipationInput
): Promise<Participation> {

  const walkRef = db
    .collection(FIRESTORE_COLLECTIONS.WALKS)
    .doc(input.walk_id);

  const participationRef = db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .doc();

  const participation = await db.runTransaction(async (transaction) => {

    // Get walk
    const walkDoc = await transaction.get(walkRef);
    if (!walkDoc.exists) {
      throw new Error("Walk does not exist");
    }

    // Get relevant walk data
    const walkData = walkDoc.data();

    // Helper: close old scheduled walks so participants can't sign up years later.
    const endOfDayUTC = (iso: string): Date => {
      const d = new Date(iso);
      const ymd = d.toISOString().slice(0, 10);
      return new Date(`${ymd}T23:59:59.999Z`);
    };

    const now = new Date();

    // Check walk status
    if (walkData?.status !== "UPCOMING") {
      throw new Error("Walk is not open for registration");
    }

    // If the scheduled day has already ended, close the walk and block registration.
    if (walkData?.status === "UPCOMING" && walkData?.date_time) {
      const closesAt = endOfDayUTC(walkData.date_time);
      if (now > closesAt) {
        transaction.update(walkRef, {
          status: "COMPLETED",
          ended_at: closesAt.toISOString(),
        });
        throw new Error("Walk is not open for registration");
      }
    }

    // Check current participants
    const participantsQuery = db
      .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
      .where("walk_id", "==", input.walk_id);
    
    // Prevent race conditions
    const participantsSnapshot = await transaction.get(participantsQuery);

    // Check duplicate registration
    const alreadyRegistered = participantsSnapshot.docs.some(
      (doc) => doc.data().user_id === input.user_id
    );

    // Check for current registration
    if (alreadyRegistered) {
      throw new Error("User already registered for this walk");
    }

    const targetWalkDay = walkCalendarDay(walkData?.date_time);
    if (targetWalkDay) {
      const userParticipationsQuery = db
        .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
        .where("user_id", "==", input.user_id);

      const userParticipationsSnapshot = await transaction.get(userParticipationsQuery);
      const sameDayWalkIds = [
        ...new Set(
          userParticipationsSnapshot.docs
            .map((doc) => doc.data().walk_id)
            .filter((walkId): walkId is string => typeof walkId === "string" && walkId !== input.walk_id)
        ),
      ];

      for (const existingWalkId of sameDayWalkIds) {
        const existingWalkRef = db
          .collection(FIRESTORE_COLLECTIONS.WALKS)
          .doc(existingWalkId);
        const existingWalkDoc = await transaction.get(existingWalkRef);
        if (!existingWalkDoc.exists) {
          continue;
        }
        const existingWalkData = existingWalkDoc.data();
        const existingWalkDay = walkCalendarDay(existingWalkData?.date_time);
        const existingWalkStatus = existingWalkData?.status;

        if (
          existingWalkDay === targetWalkDay &&
          (existingWalkStatus === "UPCOMING" || existingWalkStatus === "IN_PROGRESS")
        ) {
          throw new Error("You are already signed up for another walk on this day");
        }
      }
    }

    // Check slot availability
    const currentParticipants = participantsSnapshot.size;
    
    // Get the number of participants already registered in the walk
    const maxSlots = walkData?.max_slots;

    // Check if the slot is already full
    if (currentParticipants >= maxSlots) {
      throw new Error("Walk is already full");
    }

    // Assign group leader if first participant
    if (currentParticipants === 0) {
      transaction.update(walkRef, {
        group_leader_id: input.user_id
      });
    }

    // Create walk participation
    const participation: Participation = {
      participation_id: participationRef.id,
      walk_id: input.walk_id,
      user_id: input.user_id,
      attendance_status: "REGISTERED",
      created_at: Date.now()
    };

    // Indicate successful registration
    transaction.set(participationRef, participation);

    return participation;
  });

  try {
    await notifyWalkSignup(participation);
  } catch (error) {
    console.error("Failed to send sign-up notifications", error);
  }

  return participation;
}

/**
 * Picks the next group leader from remaining participant user IDs (withdrawal / deactivation).
 * Matches withdrawal: random among others; null if none.
 */
export function pickNewGroupLeaderIdFromOtherParticipants(
  otherParticipantUserIds: string[],
): string | null {
  if (otherParticipantUserIds.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * otherParticipantUserIds.length);
  return otherParticipantUserIds[randomIndex];
}

function isAuthUserDeactivated(user: { disabled: boolean; customClaims?: { account_disabled?: unknown } }): boolean {
  return Boolean(user.disabled || user.customClaims?.account_disabled === true);
}

const AUTH_GET_USERS_CHUNK = 100;
const ELIGIBLE_ATTENDANCE_STATUSES = new Set(["REGISTERED", "ATTENDED"]);

/**
 * Batch lookup of deactivated state (Firebase `disabled` or `account_disabled` claim), same semantics as UserRepository.mapAuthUser.
 */
export async function batchGetUserDisabledByUid(uids: string[]): Promise<Record<string, boolean>> {
  const unique = [...new Set(uids.filter(Boolean))];
  const out: Record<string, boolean> = {};
  for (let i = 0; i < unique.length; i += AUTH_GET_USERS_CHUNK) {
    const chunk = unique.slice(i, i + AUTH_GET_USERS_CHUNK);
    const result = await auth.getUsers(chunk.map((uid) => ({ uid })));
    for (const u of result.users) {
      out[u.uid] = isAuthUserDeactivated(u);
    }
    for (const id of result.notFound) {
      if ("uid" in id && typeof (id as { uid: string }).uid === "string") {
        out[(id as { uid: string }).uid] = true;
      }
    }
  }
  return out;
}

export async function enrichParticipationsWithDisabled<T extends { user_id: string }>(
  rows: T[],
): Promise<Array<T & { disabled: boolean }>> {
  const disabledByUid = await batchGetUserDisabledByUid(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    ...r,
    disabled: disabledByUid[r.user_id] ?? true,
  }));
}

function isEligibleParticipation(participation: Participation): boolean {
  return ELIGIBLE_ATTENDANCE_STATUSES.has(participation.attendance_status);
}

function sortByJoinTimeAscending(participations: Participation[]): Participation[] {
  return [...participations].sort((left, right) => {
    if (left.created_at !== right.created_at) {
      return left.created_at - right.created_at;
    }
    return left.user_id.localeCompare(right.user_id);
  });
}

async function pickReplacementSubmitterId(
  participations: Participation[],
  excludeUserId?: string,
): Promise<string | null> {
  const remaining = sortByJoinTimeAscending(participations).filter(
    (participation) =>
      participation.user_id !== excludeUserId && isEligibleParticipation(participation),
  );

  if (remaining.length === 0) {
    return null;
  }

  const disabledByUid = await batchGetUserDisabledByUid(remaining.map((row) => row.user_id));
  const replacement = remaining.find((row) => !(disabledByUid[row.user_id] ?? true));
  return replacement?.user_id ?? null;
}

function walkFromStoredDoc(
  walkId: string,
  data: Record<string, unknown> | undefined,
): Walk {
  const routePoints = Array.isArray(data?.route_points)
    ? (data?.route_points as Array<{ lat: number; lng: number }>)
    : [];
  const legacyRouteInfo = Array.isArray(data?.route_info)
    ? (data?.route_info as [number, number][])
    : undefined;
  const route_info =
    legacyRouteInfo ??
    routePoints.map((point) => [point.lat, point.lng] as [number, number]);

  return {
    walk_id: walkId,
    route_info,
    date_time: String(data?.date_time ?? ""),
    scheduled_end_time:
      typeof data?.scheduled_end_time === "string" ? data.scheduled_end_time : undefined,
    max_slots: Number(data?.max_slots ?? 0),
    group_leader_id:
      typeof data?.group_leader_id === "string" || data?.group_leader_id === null
        ? (data.group_leader_id as string | null)
        : null,
    status: (data?.status as WalkStatus) ?? WalkStatus.UPCOMING,
    has_sightings: Boolean(data?.has_sightings),
    name: typeof data?.name === "string" ? data.name : "",
    started_at: typeof data?.started_at === "string" ? data.started_at : undefined,
    ended_at: typeof data?.ended_at === "string" ? data.ended_at : undefined,
  };
}

export async function getEligibleSubmitterCandidates(walkId: string): Promise<Participation[]> {
  const participations = await listParticipationsByWalk(walkId);
  const eligible = sortByJoinTimeAscending(participations).filter(isEligibleParticipation);
  if (eligible.length === 0) {
    return [];
  }

  const disabledByUid = await batchGetUserDisabledByUid(eligible.map((row) => row.user_id));
  return eligible.filter((row) => !(disabledByUid[row.user_id] ?? true));
}

export async function reassignSubmitterIfNeeded(
  walkId: string,
  removedUserId: string,
): Promise<void> {
  const walkRef = db.collection(FIRESTORE_COLLECTIONS.WALKS).doc(walkId);
  const remainingQuery = db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("walk_id", "==", walkId);

  await db.runTransaction(async (transaction) => {
    const walkDoc = await transaction.get(walkRef);
    if (!walkDoc.exists) {
      return;
    }

    const walkData = walkDoc.data();
    if (walkData?.group_leader_id !== removedUserId) {
      return;
    }

    const remainingSnapshot = await transaction.get(remainingQuery);
    const remainingParticipations = remainingSnapshot.docs.map(
      (doc) => doc.data() as Participation,
    );
    const replacementUserId = await pickReplacementSubmitterId(
      remainingParticipations,
      removedUserId,
    );

    transaction.update(walkRef, {
      group_leader_id: replacementUserId,
    });
  });
}

export async function transferDesignatedSubmitter(params: {
  walkId: string
  requesterId: string
  requesterIsAdmin: boolean
  newSubmitterId: string
}): Promise<Walk> {
  const { walkId, requesterId, requesterIsAdmin, newSubmitterId } = params;
  const walkRef = db.collection(FIRESTORE_COLLECTIONS.WALKS).doc(walkId);
  const participantsQuery = db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("walk_id", "==", walkId);

  const updatedWalk = await db.runTransaction(async (transaction) => {
    const walkDoc = await transaction.get(walkRef);
    if (!walkDoc.exists) {
      throw new Error("Walk does not exist");
    }

    const walkData = walkDoc.data() as Record<string, unknown> | undefined;
    const currentSubmitterId =
      typeof walkData?.group_leader_id === "string" ? walkData.group_leader_id : null;

    if (!requesterIsAdmin && currentSubmitterId !== requesterId) {
      throw new Error("Only the current designated submitter or an admin can transfer submitter role");
    }

    const participantsSnapshot = await transaction.get(participantsQuery);
    const participants = participantsSnapshot.docs.map((doc) => doc.data() as Participation);
    const targetParticipation = participants.find(
      (participation) => participation.user_id === newSubmitterId,
    );

    if (!targetParticipation || !isEligibleParticipation(targetParticipation)) {
      throw new Error("New designated submitter must be an active participant of this walk");
    }

    const disabledByUid = await batchGetUserDisabledByUid([newSubmitterId]);
    if (disabledByUid[newSubmitterId] ?? true) {
      throw new Error("Deactivated users cannot be assigned as designated submitter");
    }

    transaction.update(walkRef, {
      group_leader_id: newSubmitterId,
    });

    return walkFromStoredDoc(walkId, {
      ...walkData,
      group_leader_id: newSubmitterId,
    });
  });

  return updatedWalk;
}

/**
 * Before disabling a user: for each UPCOMING/IN_PROGRESS walk they join where they are group leader, reassign leader.
 * Uses walk repository reads only (no auto-close side effects from getWalkById service).
 */
export async function reassignGroupLeadersBeforeUserDeactivation(userId: string): Promise<void> {
  const participations = await listParticipationsByUser(userId);
  const walkIds = [...new Set(participations.map((p) => p.walk_id))];
  for (const walkId of walkIds) {
    const walk = await walkRepo.getWalkById(walkId);
    if (!walk) continue;
    if (walk.status !== WalkStatus.UPCOMING && walk.status !== WalkStatus.IN_PROGRESS) continue;
    if (walk.group_leader_id !== userId) continue;
    await reassignSubmitterIfNeeded(walkId, userId);
  }
}

export async function withdrawFromWalk(
  walkId: string,
  userId: string
): Promise<void> {

  const walkRef = db
    .collection(FIRESTORE_COLLECTIONS.WALKS)
    .doc(walkId);

  const participationQuery = db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("walk_id", "==", walkId)
    .where("user_id", "==", userId);

  const remainingQuery = db
    .collection(FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS)
    .where("walk_id", "==", walkId);

  const context = await db.runTransaction(async (transaction) => {

    // Get walk
    const walkDoc = await transaction.get(walkRef);
    if (!walkDoc.exists) {
      throw new Error("Walk does not exist");
    }

    const walkData = walkDoc.data();

    // Get participation record (must use transaction.get for consistency)
    const participationSnapshot = await transaction.get(participationQuery);

    if (participationSnapshot.empty) {
      throw new Error("User is not registered for this walk");
    }

    const participationDoc = participationSnapshot.docs[0];
    const participationRef = participationDoc.ref;
    const participationId = participationDoc.id;

    // Firestore requires all reads to complete before any writes in a transaction.
    const remainingSnapshot = await transaction.get(remainingQuery);
    const remainingParticipants = remainingSnapshot.docs.filter(
      doc => doc.data().user_id !== userId
    );

    // Writes: delete participation, then optionally update walk leader
    transaction.delete(participationRef);

    if (walkData?.group_leader_id === userId) {
      const remainingRows = remainingParticipants.map((doc) => doc.data() as Participation);
      const newLeader = await pickReplacementSubmitterId(remainingRows, userId);
      transaction.update(walkRef, {
        group_leader_id: newLeader,
      });
    }

    return {
      participationId,
      remainingParticipantIds: remainingParticipants.map((doc) => doc.data().user_id as string),
    };
  });

  try {
    await cancelWalkReminderForParticipation(context.participationId);
  } catch (error) {
    console.error("Failed to cancel scheduled walk reminder", error);
  }

  try {
    await notifyLateWalkCancellation({
      walkId,
      canceledByUserId: userId,
      remainingParticipantIds: context.remainingParticipantIds,
    });
  } catch (error) {
    console.error("Failed to send late cancellation notifications", error);
  }
}
