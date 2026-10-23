import { Type } from "@sinclair/typebox";
import { FastifyInstance } from "fastify";
import {
  participateInWalk,
  withdrawParticipation,
  getWalkParticipants,
  getMyWalks,
  updateDesignatedSubmitter,
} from "./participation.controller";
import { verifyToken } from "../../middleware/auth.middleware";
import { WalkResponseSchema } from "../walks/walk.schema";

const ParticipationSchema = Type.Object({
  participation_id: Type.String(),
  walk_id: Type.String(),
  user_id: Type.String(),
  attendance_status: Type.Union([
    Type.Literal("REGISTERED"),
    Type.Literal("ATTENDED"),
    Type.Literal("ABSENT"),
  ]),
  created_at: Type.Number(),
});

const ParticipationWithDisabledSchema = Type.Intersect([
  ParticipationSchema,
  Type.Object({ disabled: Type.Boolean() }),
]);

/** My-walks response: participation plus walk metadata for UI */
const MyWalkParticipationSchema = Type.Object({
  participation_id: Type.String(),
  walk_id: Type.String(),
  user_id: Type.String(),
  attendance_status: Type.Union([
    Type.Literal("REGISTERED"),
    Type.Literal("ATTENDED"),
    Type.Literal("ABSENT"),
  ]),
  created_at: Type.Number(),
  group_leader_id: Type.Union([Type.String(), Type.Null()]),
  walk_name: Type.String(),
  status: Type.String(),
  walk_date_time: Type.String(),
});

const ErrorSchema = Type.Object({ error: Type.String() });
const WalkIdParams = Type.Object({ walkId: Type.String() });
const UpdateDesignatedSubmitterBody = Type.Object({
  newSubmitterId: Type.String(),
});

export async function participationRoutes(fastify: FastifyInstance) {

  // Volunteer sign up for walk
  fastify.post(
    "/api/walks/:walkId/participate",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "signUpForWalk",
        description: "Sign up the authenticated volunteer for a walk",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: WalkIdParams,
        response: {
          201: ParticipationSchema,
          400: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    participateInWalk
  );

  // Withdraw from walk
  fastify.delete(
    "/api/walks/:walkId/participate",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "withdrawFromWalk",
        description: "Withdraw the authenticated volunteer from a walk",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: WalkIdParams,
        response: {
          204: Type.Null(),
          400: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    withdrawParticipation
  );

  // Transfer designated submitter for a walk
  fastify.patch(
    "/api/walks/:walkId/designated-submitter",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "updateDesignatedSubmitter",
        description: "Transfer designated submitter to another eligible participant",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: WalkIdParams,
        body: UpdateDesignatedSubmitterBody,
        response: {
          200: WalkResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    updateDesignatedSubmitter
  );

  // List participants for a walk
  fastify.get(
    "/api/walks/:walkId/participants",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "getWalkParticipants",
        description: "List participants for a walk (admin or walk participants only)",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: WalkIdParams,
        response: {
          200: Type.Array(ParticipationWithDisabledSchema),
          403: ErrorSchema,
        },
      },
    },
    getWalkParticipants
  );

  // List walks the user joined
  fastify.get(
    "/api/users/me/walks",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "getMyWalks",
        description: "List all walks the authenticated user has signed up for",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Array(MyWalkParticipationSchema),
        },
      },
    },
    getMyWalks
  );
}
