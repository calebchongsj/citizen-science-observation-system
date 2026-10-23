import { describe, test, expect, vi, beforeEach } from "vitest";
import { FIRESTORE_COLLECTIONS } from "../../lib/firestore-collections";

/**
 * In-memory Firestore-style store. No real Firebase or credentials,
 * and the real database is never modified.
 */
type Store = {
  walks: Map<string, Record<string, unknown>>;
  participations: Map<string, Record<string, unknown>>;
  disabledUsers: Set<string>;
  nextParticipationId: number;
};

const { createStore, createMockDb, shared } = vi.hoisted(() => {
  function createStore(): Store {
    return {
      walks: new Map(),
      participations: new Map(),
      disabledUsers: new Set(),
      nextParticipationId: 0,
    };
  }

  function createMockDb(storeRef: Store) {
    const docRef = (collectionName: string, id?: string) => {
      const docId =
        id ?? `mock-participation-${storeRef.nextParticipationId++}`;
      return {
        id: docId,
        ref: { id: docId, _collection: collectionName },
        async get() {
          const map =
            collectionName === FIRESTORE_COLLECTIONS.WALKS
              ? storeRef.walks
              : storeRef.participations;
          const data = map.get(docId);
          return { exists: !!data, data: () => data ?? undefined };
        },
        set(data: Record<string, unknown>) {
          const map =
            collectionName === FIRESTORE_COLLECTIONS.WALKS
              ? storeRef.walks
              : storeRef.participations;
          map.set(docId, data);
        },
      };
    };

    const buildQuery = (
      name: string,
      filters: Array<{ field: string; value: unknown }>
    ) => ({
      where: (field: string, _op: string, value: unknown) =>
        buildQuery(name, [...filters, { field, value }]),
      get: async () => {
        const map =
          name === FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS
            ? storeRef.participations
            : storeRef.walks;
        const docs = Array.from(map.entries())
          .filter(([, data]) =>
            filters.every(
              ({ field, value }) =>
                (data as Record<string, unknown>)[field] === value
            )
          )
          .map(([id, data]) => ({
            id,
            ref: { id, _collection: name },
            data: () => data,
          }));
        return {
          docs,
          size: docs.length,
          empty: docs.length === 0,
        };
      },
    });

    const collection = (name: string) => ({
      doc: (id?: string) => {
        const d = docRef(name, id);
        return {
          id: d.id,
          _collection: name,
          ref: d.ref,
          get: d.get,
          set: (data: Record<string, unknown>) =>
            d.set({
              ...data,
              ...(name === FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS
                ? { participation_id: d.id }
                : {}),
            }),
        };
      },
      where: (field: string, _op: string, value: unknown) =>
        buildQuery(name, [{ field, value }]),
    });

    const runTransaction = async (
      fn: (transaction: {
        get: (ref: unknown) => Promise<unknown>;
        update: (
          ref: { id: string; _collection: string },
          data: Record<string, unknown>
        ) => void;
        set: (
          ref: { id: string; _collection: string },
          data: Record<string, unknown>
        ) => void;
        delete: (ref: { id: string; _collection: string }) => void;
      }) => Promise<unknown>
    ) => {
      const writes: Array<() => void> = [];
      const transaction = {
        get: async (refOrQuery: unknown) => {
          const rq = refOrQuery as {
            get?: () => Promise<unknown>;
            id?: string;
            _collection?: string;
          };
          if (typeof rq.get === "function") {
            return rq.get();
          }
          const map =
            rq._collection === FIRESTORE_COLLECTIONS.WALKS
              ? storeRef.walks
              : storeRef.participations;
          const data = map.get(rq.id!);
          return { exists: !!data, data: () => data ?? undefined };
        },
        update: (
          ref: { id: string; _collection: string },
          data: Record<string, unknown>
        ) => {
          const map =
            ref._collection === FIRESTORE_COLLECTIONS.WALKS
              ? storeRef.walks
              : storeRef.participations;
          const existing = map.get(ref.id) ?? {};
          writes.push(() =>
            map.set(ref.id, { ...existing, ...data } as Record<string, unknown>)
          );
        },
        set: (
          ref: { id: string; _collection: string },
          data: Record<string, unknown>
        ) => {
          const map =
            ref._collection === FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS
              ? storeRef.participations
              : storeRef.walks;
          writes.push(() => map.set(ref.id, data));
        },
        delete: (ref: { id: string; _collection: string }) => {
          const map =
            ref._collection === FIRESTORE_COLLECTIONS.WALK_PARTICIPATIONS
              ? storeRef.participations
              : storeRef.walks;
          writes.push(() => map.delete(ref.id));
        },
      };
      const result = await fn(transaction);
      writes.forEach((w) => w());
      return result;
    };

    return { collection, runTransaction };
  }

  const shared = {
    store: null as Store | null,
    db: null as ReturnType<typeof createMockDb> | null,
  };
  return { createStore, createMockDb, shared };
});

vi.mock("../../lib/firebase-admin", () => {
  if (!shared.store) {
    shared.store = createStore();
    shared.db = createMockDb(shared.store);
  }
  return {
    db: shared.db!,
    auth: {
      getUsers: vi.fn(async (identifiers: Array<{ uid: string }>) => ({
        users: identifiers
          .filter(({ uid }) => !uid.startsWith("missing-"))
          .map(({ uid }) => ({
            uid,
            disabled: shared.store?.disabledUsers.has(uid) ?? false,
            customClaims: {},
          })),
        notFound: identifiers.filter(({ uid }) => uid.startsWith("missing-")),
      })),
    },
  };
});

const notificationMocks = vi.hoisted(() => ({
  notifyWalkSignupMock: vi.fn(),
  cancelWalkReminderForParticipationMock: vi.fn(),
  notifyLateWalkCancellationMock: vi.fn(),
}));

vi.mock("../../services/walk-notification.service", () => ({
  notifyWalkSignup: notificationMocks.notifyWalkSignupMock,
  cancelWalkReminderForParticipation: notificationMocks.cancelWalkReminderForParticipationMock,
  notifyLateWalkCancellation: notificationMocks.notifyLateWalkCancellationMock,
}));

import "../../lib/firebase-admin";
import {
  signUpForWalk,
  transferDesignatedSubmitter,
  withdrawFromWalk,
} from "./participation.service";

const store = shared.store!;

describe("Participation Service", () => {
  beforeEach(() => {
    store.walks.clear();
    store.participations.clear();
    store.disabledUsers.clear();
    store.nextParticipationId = 0;
    notificationMocks.notifyWalkSignupMock.mockReset();
    notificationMocks.cancelWalkReminderForParticipationMock.mockReset();
    notificationMocks.notifyLateWalkCancellationMock.mockReset();
  });

  test("should prevent duplicate registration", async () => {
    const walkId = "test-walk-duplicate-" + Date.now();
    const userId = "test-user-" + Date.now();

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "UPCOMING",
      max_slots: 5,
    });
    // Pre-populate so the single signUpForWalk call sees existing registration
    store.participations.set("existing-participation", {
      participation_id: "existing-participation",
      walk_id: walkId,
      user_id: userId,
      attendance_status: "REGISTERED",
      created_at: Date.now(),
    });

    await expect(
      signUpForWalk({ walk_id: walkId, user_id: userId })
    ).rejects.toThrow("User already registered for this walk");
  });

  test("should prevent overbooking when slots are full", async () => {
    const walkId = "test-walk-full-" + Date.now();

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "UPCOMING",
      max_slots: 1,
    });
    // Pre-populate so the one slot is already taken
    store.participations.set("existing-participation", {
      participation_id: "existing-participation",
      walk_id: walkId,
      user_id: "user-1",
      attendance_status: "REGISTERED",
      created_at: Date.now(),
    });

    await expect(
      signUpForWalk({
        walk_id: walkId,
        user_id: "user-2-" + Date.now(),
      })
    ).rejects.toThrow("Walk is already full");
  });

  test("should prevent a user from signing up for two walks on the same day", async () => {
    const userId = "test-user-same-day";
    const firstWalkId = "test-walk-same-day-1";
    const secondWalkId = "test-walk-same-day-2";

    store.walks.set(firstWalkId, {
      walk_id: firstWalkId,
      status: "UPCOMING",
      max_slots: 5,
      date_time: "2026-04-20T09:00:00",
    });
    store.walks.set(secondWalkId, {
      walk_id: secondWalkId,
      status: "UPCOMING",
      max_slots: 5,
      date_time: "2026-04-20T18:00:00",
    });
    store.participations.set("existing-participation", {
      participation_id: "existing-participation",
      walk_id: firstWalkId,
      user_id: userId,
      attendance_status: "REGISTERED",
      created_at: Date.now(),
    });

    await expect(
      signUpForWalk({
        walk_id: secondWalkId,
        user_id: userId,
      })
    ).rejects.toThrow("You are already signed up for another walk on this day");
  });

  test("first participant should become group leader", async () => {
    const walkId = "test-walk-leader-" + Date.now();
    const leaderId = "leader-" + Date.now();

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "UPCOMING",
      max_slots: 5,
      group_leader_id: null,
    });

    const result = await signUpForWalk({ walk_id: walkId, user_id: leaderId });

    expect(result.user_id).toBe(leaderId);
    expect(result.walk_id).toBe(walkId);
    expect(result.attendance_status).toBe("REGISTERED");
    expect(result.participation_id).toBeDefined();
    expect(notificationMocks.notifyWalkSignupMock).toHaveBeenCalledWith(result);
  });

  test("should reject sign-up for completed walk", async () => {
    const walkId = "test-walk-completed-" + Date.now();

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "COMPLETED",
      max_slots: 5,
    });

    await expect(
      signUpForWalk({
        walk_id: walkId,
        user_id: "user-" + Date.now(),
      })
    ).rejects.toThrow("Walk is not open for registration");
  });

  test("current submitter should manually transfer role to another participant", async () => {
    const walkId = "test-walk-manual-transfer";
    const leaderId = "leader-1";
    const participantId = "participant-2";

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "UPCOMING",
      max_slots: 5,
      route_points: [],
      has_sightings: false,
      date_time: "2026-04-20T09:00:00.000Z",
      group_leader_id: leaderId,
      name: "Manual transfer walk",
    });
    store.participations.set("p1", {
      participation_id: "p1",
      walk_id: walkId,
      user_id: leaderId,
      attendance_status: "REGISTERED",
      created_at: 1,
    });
    store.participations.set("p2", {
      participation_id: "p2",
      walk_id: walkId,
      user_id: participantId,
      attendance_status: "REGISTERED",
      created_at: 2,
    });

    const updated = await transferDesignatedSubmitter({
      walkId,
      requesterId: leaderId,
      requesterIsAdmin: false,
      newSubmitterId: participantId,
    });

    expect(updated.group_leader_id).toBe(participantId);
    expect(store.walks.get(walkId)?.group_leader_id).toBe(participantId);
  });

  test("non-submitter non-admin cannot transfer role", async () => {
    const walkId = "test-walk-transfer-forbidden";
    const leaderId = "leader-1";
    const otherUserId = "participant-3";

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "UPCOMING",
      max_slots: 5,
      route_points: [],
      has_sightings: false,
      date_time: "2026-04-20T09:00:00.000Z",
      group_leader_id: leaderId,
    });
    store.participations.set("p1", {
      participation_id: "p1",
      walk_id: walkId,
      user_id: leaderId,
      attendance_status: "REGISTERED",
      created_at: 1,
    });
    store.participations.set("p2", {
      participation_id: "p2",
      walk_id: walkId,
      user_id: otherUserId,
      attendance_status: "REGISTERED",
      created_at: 2,
    });

    await expect(
      transferDesignatedSubmitter({
        walkId,
        requesterId: otherUserId,
        requesterIsAdmin: false,
        newSubmitterId: otherUserId,
      }),
    ).rejects.toThrow("Only the current designated submitter or an admin can transfer submitter role");
  });

  test("cannot transfer role to participant from another walk", async () => {
    const walkId = "test-walk-transfer-other-walk";
    const leaderId = "leader-1";
    const outsiderId = "participant-other-walk";

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "UPCOMING",
      max_slots: 5,
      route_points: [],
      has_sightings: false,
      date_time: "2026-04-20T09:00:00.000Z",
      group_leader_id: leaderId,
    });
    store.participations.set("p1", {
      participation_id: "p1",
      walk_id: walkId,
      user_id: leaderId,
      attendance_status: "REGISTERED",
      created_at: 1,
    });
    store.participations.set("p2", {
      participation_id: "p2",
      walk_id: "another-walk",
      user_id: outsiderId,
      attendance_status: "REGISTERED",
      created_at: 2,
    });

    await expect(
      transferDesignatedSubmitter({
        walkId,
        requesterId: leaderId,
        requesterIsAdmin: false,
        newSubmitterId: outsiderId,
      }),
    ).rejects.toThrow("New designated submitter must be an active participant of this walk");
  });

  test("cannot transfer role to withdrawn or cancelled participant", async () => {
    const walkId = "test-walk-transfer-absent";
    const leaderId = "leader-1";
    const absentParticipantId = "participant-absent";

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "UPCOMING",
      max_slots: 5,
      route_points: [],
      has_sightings: false,
      date_time: "2026-04-20T09:00:00.000Z",
      group_leader_id: leaderId,
    });
    store.participations.set("p1", {
      participation_id: "p1",
      walk_id: walkId,
      user_id: leaderId,
      attendance_status: "REGISTERED",
      created_at: 1,
    });
    store.participations.set("p2", {
      participation_id: "p2",
      walk_id: walkId,
      user_id: absentParticipantId,
      attendance_status: "ABSENT",
      created_at: 2,
    });

    await expect(
      transferDesignatedSubmitter({
        walkId,
        requesterId: leaderId,
        requesterIsAdmin: false,
        newSubmitterId: absentParticipantId,
      }),
    ).rejects.toThrow("New designated submitter must be an active participant of this walk");
  });

  test("cannot transfer role to deactivated account", async () => {
    const walkId = "test-walk-transfer-disabled";
    const leaderId = "leader-1";
    const disabledParticipantId = "participant-disabled";
    store.disabledUsers.add(disabledParticipantId);

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "UPCOMING",
      max_slots: 5,
      route_points: [],
      has_sightings: false,
      date_time: "2026-04-20T09:00:00.000Z",
      group_leader_id: leaderId,
    });
    store.participations.set("p1", {
      participation_id: "p1",
      walk_id: walkId,
      user_id: leaderId,
      attendance_status: "REGISTERED",
      created_at: 1,
    });
    store.participations.set("p2", {
      participation_id: "p2",
      walk_id: walkId,
      user_id: disabledParticipantId,
      attendance_status: "REGISTERED",
      created_at: 2,
    });

    await expect(
      transferDesignatedSubmitter({
        walkId,
        requesterId: leaderId,
        requesterIsAdmin: false,
        newSubmitterId: disabledParticipantId,
      }),
    ).rejects.toThrow("Deactivated users cannot be assigned as designated submitter");
  });

  test("leader withdrawal should assign earliest eligible replacement", async () => {
    const walkId = "test-walk-withdraw-reassign";
    const leaderId = "leader-1";
    const earliestParticipantId = "participant-2";
    const laterParticipantId = "participant-3";
    store.disabledUsers.add(leaderId);

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "UPCOMING",
      max_slots: 5,
      group_leader_id: leaderId,
    });
    store.participations.set("p1", {
      participation_id: "p1",
      walk_id: walkId,
      user_id: leaderId,
      attendance_status: "REGISTERED",
      created_at: Date.now(),
    });
    store.participations.set("p2", {
      participation_id: "p2",
      walk_id: walkId,
      user_id: earliestParticipantId,
      attendance_status: "REGISTERED",
      created_at: 10,
    });
    store.participations.set("p3", {
      participation_id: "p3",
      walk_id: walkId,
      user_id: laterParticipantId,
      attendance_status: "REGISTERED",
      created_at: 20,
    });

    await withdrawFromWalk(walkId, leaderId);

    expect(store.participations.has("p1")).toBe(false);
    expect(store.walks.get(walkId)?.group_leader_id).toBe(earliestParticipantId);
    expect(notificationMocks.cancelWalkReminderForParticipationMock).toHaveBeenCalledWith("p1");
    expect(notificationMocks.notifyLateWalkCancellationMock).toHaveBeenCalledWith({
      walkId,
      canceledByUserId: leaderId,
      remainingParticipantIds: [earliestParticipantId, laterParticipantId],
    });
  });

  test("leader withdrawal should clear leader when no participants remain", async () => {
    const walkId = "test-walk-withdraw-clear";
    const leaderId = "leader-1";

    store.walks.set(walkId, {
      walk_id: walkId,
      status: "UPCOMING",
      max_slots: 5,
      group_leader_id: leaderId,
    });
    store.participations.set("p1", {
      participation_id: "p1",
      walk_id: walkId,
      user_id: leaderId,
      attendance_status: "REGISTERED",
      created_at: Date.now(),
    });

    await withdrawFromWalk(walkId, leaderId);

    expect(store.participations.has("p1")).toBe(false);
    expect(store.walks.get(walkId)?.group_leader_id).toBeNull();
    expect(notificationMocks.cancelWalkReminderForParticipationMock).toHaveBeenCalledWith("p1");
    expect(notificationMocks.notifyLateWalkCancellationMock).toHaveBeenCalledWith({
      walkId,
      canceledByUserId: leaderId,
      remainingParticipantIds: [],
    });
  });
});
