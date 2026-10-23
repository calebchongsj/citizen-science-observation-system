import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  createWalkHandler,
  listWalksHandler,
  getWalkHandler,
  updateWalkHandler,
  deleteWalkHandler,
} from "../modules/walks/walk.controller";
import * as walkService from "../modules/walks/walk.service";
import { WalkStatus } from "../modules/walks/walk.types";

vi.mock("../modules/walks/walk.service");

describe("Walk Handlers", () => {
  function mockReply(): FastifyReply {
    return {
      code: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
  }

  beforeEach(() => {
    vi.mocked(walkService.createWalk).mockReset();
    vi.mocked(walkService.createWalks).mockReset();
    vi.mocked(walkService.listWalks).mockReset();
    vi.mocked(walkService.getWalkById).mockReset();
    vi.mocked(walkService.getWalkDetailForApi).mockReset();
    vi.mocked(walkService.updateWalk).mockReset();
    vi.mocked(walkService.deleteWalk).mockReset();
  });

  describe("createWalkHandler", () => {
    it("should create walk and return 201 with created walks payload", async () => {
      const body = {
        route_info: [[1.35, 103.8], [1.36, 103.81]] as [number, number][],
        date_time: "2026-04-10T14:00:00",
        max_slots: 10,
      };
      const createdWalk: Awaited<ReturnType<typeof walkService.createWalk>> = {
        walk_id: "test-walk-id",
        route_info: body.route_info,
        date_time: body.date_time,
        max_slots: body.max_slots,
        group_leader_id: null,
        status: WalkStatus.UPCOMING,
        has_sightings: false,
      };
      vi.mocked(walkService.createWalks).mockResolvedValue([createdWalk]);

      const request = { body } as FastifyRequest;
      const reply = mockReply();

      await createWalkHandler(request, reply);

      expect(walkService.createWalks).toHaveBeenCalledOnce();
      expect(walkService.createWalks).toHaveBeenCalledWith(body);
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({
        walks: [createdWalk],
        created_count: 1,
      });
    });
  });

  describe("listWalksHandler", () => {
    it("should return list of walks from service", async () => {
      const walks: Awaited<ReturnType<typeof walkService.listWalks>> = [
        {
          walk_id: "w1",
          route_info: [[1, 2]],
          date_time: "2026-04-10T14:00:00",
          max_slots: 5,
          group_leader_id: null,
          status: WalkStatus.UPCOMING,
          has_sightings: false,
        },
      ];
      vi.mocked(walkService.listWalks).mockResolvedValue(walks);

      const reply = mockReply();

      await listWalksHandler({} as FastifyRequest, reply);

      expect(walkService.listWalks).toHaveBeenCalledOnce();
      expect(reply.send).toHaveBeenCalledWith(walks);
    });

    it("should return empty array when no walks", async () => {
      vi.mocked(walkService.listWalks).mockResolvedValue([]);

      const reply = mockReply();

      await listWalksHandler({} as FastifyRequest, reply);

      expect(reply.send).toHaveBeenCalledWith([]);
    });
  });

  describe("getWalkHandler", () => {
    it("should return walk when found", async () => {
      const walk: Awaited<ReturnType<typeof walkService.getWalkDetailForApi>> = {
        walk_id: "w1",
        route_info: [[1, 2]],
        date_time: "2026-04-10T14:00:00",
        max_slots: 5,
        group_leader_id: null,
        status: WalkStatus.UPCOMING,
        has_sightings: false,
        current_participant_count: 0,
        participants: [],
      };
      vi.mocked(walkService.getWalkDetailForApi).mockResolvedValue(walk);

      const request = { params: { id: "w1" } } as FastifyRequest<{ Params: { id: string } }>;
      const reply = mockReply();

      await getWalkHandler(request, reply);

      expect(walkService.getWalkDetailForApi).toHaveBeenCalledWith("w1");
      expect(reply.send).toHaveBeenCalledWith(walk);
      expect(reply.code).not.toHaveBeenCalledWith(404);
    });

    it("should return 404 when walk not found", async () => {
      vi.mocked(walkService.getWalkDetailForApi).mockResolvedValue(null);

      const request = { params: { id: "missing" } } as FastifyRequest<{ Params: { id: string } }>;
      const reply = mockReply();

      await getWalkHandler(request, reply);

      expect(walkService.getWalkDetailForApi).toHaveBeenCalledWith("missing");
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ message: "Walk not found" });
    });
  });

  describe("updateWalkHandler", () => {
    it("should update walk and return updated walk", async () => {
      const body = {
        route_info: [[1.35, 103.8]] as [number, number][],
        date_time: "2026-04-15T10:00:00",
        max_slots: 8,
      };
      const updated: Awaited<ReturnType<typeof walkService.updateWalk>> = {
        walk_id: "w1",
        route_info: body.route_info,
        date_time: body.date_time,
        max_slots: body.max_slots,
        group_leader_id: null,
        status: WalkStatus.UPCOMING,
        has_sightings: false,
      };
      vi.mocked(walkService.updateWalk).mockResolvedValue(updated);

      const request = {
        params: { id: "w1" },
        body,
      } as FastifyRequest<{ Params: { id: string }; Body: typeof body }>;
      const reply = mockReply();

      await updateWalkHandler(request, reply);

      expect(walkService.updateWalk).toHaveBeenCalledWith("w1", body);
      expect(reply.send).toHaveBeenCalledWith(updated);
      expect(reply.code).not.toHaveBeenCalledWith(404);
    });

    it("should return 404 when walk to update not found", async () => {
      vi.mocked(walkService.updateWalk).mockResolvedValue(null);

      const request = {
        params: { id: "missing" },
        body: {
          route_info: [[1, 2]] as [number, number][],
          date_time: "2026-04-15T10:00:00",
          max_slots: 5,
        },
      } as FastifyRequest;
      const reply = mockReply();

      await updateWalkHandler(request, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ message: "Walk not found" });
    });
  });

  describe("deleteWalkHandler", () => {
    it("should delete walk and return 204", async () => {
      vi.mocked(walkService.deleteWalk).mockResolvedValue(true);

      const request = { params: { id: "w1" } } as FastifyRequest<{ Params: { id: string } }>;
      const reply = mockReply();

      await deleteWalkHandler(request, reply);

      expect(walkService.deleteWalk).toHaveBeenCalledWith("w1");
      expect(reply.code).toHaveBeenCalledWith(204);
      expect(reply.send).toHaveBeenCalled();
    });

    it("should return 404 when walk to delete not found", async () => {
      vi.mocked(walkService.deleteWalk).mockResolvedValue(false);

      const request = { params: { id: "missing" } } as FastifyRequest<{ Params: { id: string } }>;
      const reply = mockReply();

      await deleteWalkHandler(request, reply);

      expect(walkService.deleteWalk).toHaveBeenCalledWith("missing");
      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ message: "Walk not found" });
    });
  });
});
