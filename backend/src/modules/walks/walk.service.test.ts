import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as walkService from "./walk.service";
import * as walkRepo from "./walk.repository";
import * as participationRepo from "../participation/participation.repository";
import { WalkStatus } from "./walk.types";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { notifyWalkCancelledByAdmin } from "../../services/walk-notification.service";

const { mockGetUser, mockGetUsers, mockBulkParticipationDocs } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetUsers: vi.fn(),
  mockBulkParticipationDocs: vi.fn(),
}));

vi.mock("./walk.repository");
vi.mock("../participation/participation.repository");
vi.mock("../../services/walk-notification.service", () => ({
  notifyWalkCancelledByAdmin: vi.fn(),
}));

// Mock firebase-admin so updateWalk's participant-count query doesn't need credentials.
// participantCount is controlled per-test via the exported setter below.
let mockParticipantCount = 0;

vi.mock("../../lib/firebase-admin", () => ({
  db: {
    collection: (name: string) => ({
      get:
        name === "walk_participations"
          ? async () => ({ docs: mockBulkParticipationDocs() })
          : undefined,
      where: () => ({
        get: async () => ({ size: mockParticipantCount }),
      }),
    }),
  },
  auth: {
    getUser: (uid: string) => mockGetUser(uid),
    getUsers: (identifiers: Array<{ uid: string }>) => mockGetUsers(identifiers),
  },
}));

describe("Walk Service", () => {
  beforeEach(() => {
    // Keep tests deterministic even after the hard-coded April 2026 fixtures age.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    mockParticipantCount = 0;
    mockGetUser.mockReset();
    mockGetUsers.mockReset();
    mockBulkParticipationDocs.mockReset();
    mockGetUser.mockImplementation(async (uid: string) => ({
      displayName: `User ${uid}`,
      email: undefined,
    }));
    mockGetUsers.mockImplementation(async (identifiers: Array<{ uid: string }>) => ({
      users: identifiers.map(({ uid }) => ({
        uid,
        disabled: false,
        customClaims: {},
      })),
      notFound: [] as Array<{ uid: string }>,
    }));
    mockBulkParticipationDocs.mockImplementation(() => []);
    vi.mocked(walkRepo.createWalk).mockReset();
    vi.mocked(walkRepo.getWalkById).mockReset();
    vi.mocked(walkRepo.listWalks).mockReset();
    vi.mocked(walkRepo.updateWalk).mockReset();
    vi.mocked(walkRepo.updateWalkStatusAndTimestamps).mockReset();
    vi.mocked(walkRepo.deleteWalk).mockReset();
    vi.mocked(participationRepo.listParticipationsByWalk).mockReset();
    vi.mocked(participationRepo.deleteParticipationsByWalk).mockReset();
    vi.mocked(notifyWalkCancelledByAdmin).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createWalk", () => {
    it("should build walk with defaults and call repository", async () => {
      const data = {
        route_info: [[1.35, 103.8], [1.36, 103.81]] as [number, number][],
        date_time: "2026-04-15T14:00:00",
        max_slots: 10,
      };
      vi.mocked(walkRepo.createWalk).mockImplementation(async (walk) => walk);

      const result = await walkService.createWalk(data);

      expect(result.route_info).toEqual(data.route_info);
      expect(result.date_time).toBe(data.date_time);
      expect(result.max_slots).toBe(data.max_slots);
      expect(result.group_leader_id).toBeNull();
      expect(result.status).toBe(WalkStatus.UPCOMING);
      expect(result.has_sightings).toBe(false);
      expect(result.walk_id).toBeDefined();
      expect(typeof result.walk_id).toBe("string");
      expect(walkRepo.createWalk).toHaveBeenCalledOnce();
      expect(walkRepo.createWalk).toHaveBeenCalledWith(result);
    });

    it("should reject when the scheduled start is in the past", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T14:30:45.000Z"));

      await expect(
        walkService.createWalk({
          route_info: [[1.35, 103.8], [1.36, 103.81]],
          date_time: "2026-04-10T14:29:00.000Z",
          max_slots: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestError);

      expect(walkRepo.createWalk).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("should create a recurring weekly batch when recurrence is provided", async () => {
      vi.mocked(walkRepo.createWalk).mockImplementation(async (walk) => walk);

      const result = await walkService.createWalks({
        route_info: [[1.35, 103.8], [1.36, 103.81]],
        date_time: "2026-04-13T14:00:00",
        scheduled_end_time: "2026-04-13T16:00:00",
        max_slots: 10,
        recurrence: {
          repeat_weekday: "MONDAY",
          end_date: "2026-04-27",
        },
      });

      expect(result).toHaveLength(3);
      expect(result.map((walk) => walk.date_time)).toEqual([
        "2026-04-13T14:00:00",
        "2026-04-20T14:00:00",
        "2026-04-27T14:00:00",
      ]);
      expect(result.map((walk) => walk.scheduled_end_time)).toEqual([
        "2026-04-13T16:00:00",
        "2026-04-20T16:00:00",
        "2026-04-27T16:00:00",
      ]);
      expect(walkRepo.createWalk).toHaveBeenCalledTimes(3);
    });

    it("should reject recurring creation when start date does not match repeat day", async () => {
      await expect(
        walkService.createWalks({
          route_info: [[1.35, 103.8], [1.36, 103.81]],
          date_time: "2026-04-14T14:00:00",
          max_slots: 10,
          recurrence: {
            repeat_weekday: "MONDAY",
            end_date: "2026-04-28",
          },
        }),
      ).rejects.toBeInstanceOf(BadRequestError);

      expect(walkRepo.createWalk).not.toHaveBeenCalled();
    });
  });

  describe("getWalkById", () => {
    it("should return walk from repository", async () => {
      const walk = {
        walk_id: "w1",
        route_info: [[1, 2]] as [number, number][],
        date_time: "2026-04-10T14:00:00",
        max_slots: 5,
        group_leader_id: null,
        status: WalkStatus.UPCOMING,
        has_sightings: false,
      };
      vi.mocked(walkRepo.getWalkById).mockResolvedValue(walk);

      const result = await walkService.getWalkById("w1");

      expect(result).toEqual(walk);
      expect(walkRepo.getWalkById).toHaveBeenCalledWith("w1");
    });

    it("should return null when walk not found", async () => {
      vi.mocked(walkRepo.getWalkById).mockResolvedValue(null);

      const result = await walkService.getWalkById("missing");

      expect(result).toBeNull();
    });

    it("should auto-mark stale upcoming walks as abandoned", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-11T01:00:00.000Z"));

      vi.mocked(walkRepo.getWalkById).mockResolvedValue({
        walk_id: "w1",
        route_info: [[1, 2]],
        date_time: "2026-04-10T14:00:00.000Z",
        max_slots: 5,
        group_leader_id: null,
        status: WalkStatus.UPCOMING,
        has_sightings: false,
      });
      vi.mocked(walkRepo.updateWalkStatusAndTimestamps).mockResolvedValue({
        walk_id: "w1",
        route_info: [[1, 2]],
        date_time: "2026-04-10T14:00:00.000Z",
        max_slots: 5,
        group_leader_id: null,
        status: WalkStatus.ABANDONED,
        has_sightings: false,
        ended_at: "2026-04-10T23:59:59.999Z",
      });

      const result = await walkService.getWalkById("w1");

      expect(result?.status).toBe(WalkStatus.ABANDONED);
      expect(walkRepo.updateWalkStatusAndTimestamps).toHaveBeenCalledWith("w1", {
        status: WalkStatus.ABANDONED,
        ended_at: "2026-04-10T23:59:59.999Z",
      });
      vi.useRealTimers();
    });
  });

  describe("getWalkDetailForApi", () => {
    it("should return null when walk not found", async () => {
      vi.mocked(walkRepo.getWalkById).mockResolvedValue(null);

      const result = await walkService.getWalkDetailForApi("missing");

      expect(result).toBeNull();
      expect(participationRepo.listParticipationsByWalk).not.toHaveBeenCalled();
    });

    it("should attach participant count and public participant rows", async () => {
      const walk = {
        walk_id: "w1",
        route_info: [[1, 2]] as [number, number][],
        date_time: "2026-04-10T14:00:00.000Z",
        max_slots: 10,
        group_leader_id: "u-leader",
        status: WalkStatus.UPCOMING,
        has_sightings: false,
      };
      vi.mocked(walkRepo.getWalkById).mockResolvedValue(walk);
      vi.mocked(participationRepo.listParticipationsByWalk).mockResolvedValue([
        {
          participation_id: "p1",
          walk_id: "w1",
          user_id: "u-other",
          attendance_status: "REGISTERED",
          created_at: 1,
        },
        {
          participation_id: "p2",
          walk_id: "w1",
          user_id: "u-leader",
          attendance_status: "REGISTERED",
          created_at: 2,
        },
      ]);
      mockGetUser.mockImplementation(async (uid: string) => {
        if (uid === "u-leader") return { displayName: "Leader Name", email: "l@x.com" };
        return { displayName: "Other Name", email: undefined };
      });

      const result = await walkService.getWalkDetailForApi("w1");

      expect(result).not.toBeNull();
      expect(result!.current_participant_count).toBe(2);
      expect(result!.participants).toHaveLength(2);
      const leader = result!.participants.find((p) => p.user_id === "u-leader");
      expect(leader?.display_name).toBe("Leader Name");
      expect(leader?.is_designated_submitter).toBe(true);
      const other = result!.participants.find((p) => p.user_id === "u-other");
      expect(other?.is_designated_submitter).toBe(false);
      expect(leader?.disabled).toBe(false);
      expect(other?.disabled).toBe(false);
    });
  });

  describe("listWalks", () => {
    it("should return all walks from repository with active participant counts", async () => {
      const walks = [
        {
          walk_id: "w1",
          route_info: [[1, 2]] as [number, number][],
          date_time: "2026-04-10T14:00:00",
          max_slots: 5,
          group_leader_id: null,
          status: WalkStatus.UPCOMING,
          has_sightings: false,
        },
      ];
      vi.mocked(walkRepo.listWalks).mockResolvedValue(walks);
      mockBulkParticipationDocs.mockReturnValue([
        {
          data: () => ({
            participation_id: "p1",
            walk_id: "w1",
            user_id: "u1",
            attendance_status: "REGISTERED",
            created_at: 1,
          }),
        },
        {
          data: () => ({
            participation_id: "p2",
            walk_id: "w1",
            user_id: "u2",
            attendance_status: "ATTENDED",
            created_at: 2,
          }),
        },
        {
          data: () => ({
            participation_id: "p3",
            walk_id: "w1",
            user_id: "u3",
            attendance_status: "ABSENT",
            created_at: 3,
          }),
        },
      ]);

      const result = await walkService.listWalks();

      expect(result).toEqual([
        {
          ...walks[0],
          current_participant_count: 2,
        },
      ]);
      expect(walkRepo.listWalks).toHaveBeenCalledOnce();
      expect(mockBulkParticipationDocs).toHaveBeenCalledOnce();
    });
  });

  describe("updateWalk", () => {
    it("should call repository and return updated walk when slots >= participant count", async () => {
      mockParticipantCount = 3;
      const data = {
        route_info: [[1.35, 103.8]] as [number, number][],
        date_time: "2026-04-15T10:00:00",
        max_slots: 8,
      };
      const endD = new Date(data.date_time)
      endD.setHours(endD.getHours() + 2)
      const scheduled_end_time = endD.toISOString()
      const payload = { ...data, scheduled_end_time }
      const updated = {
        walk_id: "w1",
        ...data,
        scheduled_end_time,
        group_leader_id: null,
        status: WalkStatus.UPCOMING,
        has_sightings: false,
      }
      vi.mocked(walkRepo.updateWalk).mockResolvedValue(updated)

      const result = await walkService.updateWalk("w1", data)

      expect(result).toEqual(updated)
      expect(walkRepo.updateWalk).toHaveBeenCalledWith("w1", payload)
    })

    it("should reject when new max_slots is below current participant count", async () => {
      mockParticipantCount = 5; // 5 participants, can't reduce to 3
      const data = {
        route_info: [[1.35, 103.8]] as [number, number][],
        date_time: "2026-04-15T10:00:00",
        max_slots: 3,
      };

      await expect(walkService.updateWalk("w1", data)).rejects.toThrow(
        "Cannot reduce max slots to 3: walk already has 5 registered participant(s)"
      );
      expect(walkRepo.updateWalk).not.toHaveBeenCalled();
    });

    it("should reject when the updated start time is in the past", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T14:30:45.000Z"));

      await expect(
        walkService.updateWalk("w1", {
          route_info: [[1.35, 103.8], [1.36, 103.81]],
          date_time: "2026-04-10T14:29:00.000Z",
          max_slots: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestError);

      expect(walkRepo.updateWalk).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("should return null when walk not found", async () => {
      mockParticipantCount = 0;
      vi.mocked(walkRepo.updateWalk).mockResolvedValue(null);

      const result = await walkService.updateWalk("missing", {
        route_info: [[1, 2]],
        date_time: "2026-04-15T10:00:00",
        max_slots: 5,
      });

      expect(result).toBeNull();
    });
  });

  describe("deleteWalk", () => {
    it("should call repository and return true when deleted", async () => {
      vi.mocked(walkRepo.getWalkById).mockResolvedValue({
        walk_id: "w1",
        route_info: [[1, 2]],
        date_time: "2026-04-10T14:00:00.000Z",
        max_slots: 5,
        group_leader_id: null,
        status: WalkStatus.UPCOMING,
        has_sightings: false,
        name: "City Walk",
      });
      vi.mocked(participationRepo.listParticipationsByWalk).mockResolvedValue([
        {
          participation_id: "p1",
          walk_id: "w1",
          user_id: "u1",
          attendance_status: "REGISTERED",
          created_at: Date.now(),
        },
      ]);
      vi.mocked(walkRepo.deleteWalk).mockResolvedValue(true);

      const result = await walkService.deleteWalk("w1");

      expect(result).toBe(true);
      expect(walkRepo.deleteWalk).toHaveBeenCalledWith("w1");
      expect(participationRepo.deleteParticipationsByWalk).toHaveBeenCalledWith("w1");
      expect(notifyWalkCancelledByAdmin).toHaveBeenCalledWith({
        walkId: "w1",
        walkName: "City Walk",
        walkDateTime: "2026-04-10T14:00:00.000Z",
        participantIds: ["u1"],
      });
    });

    it("should return false when walk not found", async () => {
      vi.mocked(walkRepo.getWalkById).mockResolvedValue(null);

      const result = await walkService.deleteWalk("missing");

      expect(result).toBe(false);
      expect(walkRepo.deleteWalk).not.toHaveBeenCalled();
      expect(notifyWalkCancelledByAdmin).not.toHaveBeenCalled();
    });
  });

  describe("startWalk", () => {
    it("should reject with NotFoundError when walk does not exist", async () => {
      vi.mocked(walkRepo.getWalkById).mockResolvedValue(null);

      await expect(walkService.startWalk("missing")).rejects.toBeInstanceOf(NotFoundError);
      expect(walkRepo.updateWalkStatusAndTimestamps).not.toHaveBeenCalled();
    });

    it("should reject with ConflictError when walk status is not UPCOMING", async () => {
      vi.mocked(walkRepo.getWalkById).mockResolvedValue({
        walk_id: "w1",
        route_info: [[1, 2]],
        date_time: "2026-04-10T14:00:00.000Z",
        max_slots: 5,
        group_leader_id: null,
        status: WalkStatus.IN_PROGRESS,
        has_sightings: false,
      });

      await expect(walkService.startWalk("w1")).rejects.toBeInstanceOf(ConflictError);
      expect(walkRepo.updateWalkStatusAndTimestamps).not.toHaveBeenCalled();
    });

    it("should reject with BadRequestError when current time is before scheduled start", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T09:00:00.000Z"));

      vi.mocked(walkRepo.getWalkById).mockResolvedValue({
        walk_id: "w1",
        route_info: [[1, 2]],
        date_time: "2026-04-10T14:00:00.000Z",
        max_slots: 5,
        group_leader_id: null,
        status: WalkStatus.UPCOMING,
        has_sightings: false,
      });

      await expect(walkService.startWalk("w1")).rejects.toBeInstanceOf(BadRequestError);
      expect(walkRepo.updateWalkStatusAndTimestamps).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should reject with BadRequestError when current time is after the allowed start window", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-11T00:00:00.000Z"));

      vi.mocked(walkRepo.getWalkById).mockResolvedValue({
        walk_id: "w1",
        route_info: [[1, 2]],
        date_time: "2026-04-10T14:00:00.000Z",
        max_slots: 5,
        group_leader_id: null,
        status: WalkStatus.UPCOMING,
        has_sightings: false,
      });

      await expect(walkService.startWalk("w1")).rejects.toBeInstanceOf(BadRequestError);
      expect(walkRepo.updateWalkStatusAndTimestamps).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
