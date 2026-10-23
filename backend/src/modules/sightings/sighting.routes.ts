import { Type } from "@sinclair/typebox"
import { FastifyInstance } from "fastify"
import { verifyToken } from "../../middleware/auth.middleware"
import {
  createSightingHandler,
  deleteSightingHandler,
  listSightingsHandler,
  submitSightingHandler,
  updateSightingHandler,
} from "./sighting.controller"

const WalkIdParamsSchema = Type.Object({
  walkId: Type.String(),
})

const SightingIdParamsSchema = Type.Object({
  walkId: Type.String(),
  sightingId: Type.String(),
})

// Use Unsafe so serialized schema has type+enum (avoids FST_ERR_SCH_SERIALIZATION_BUILD with Union)
const SubmissionStatusSchema = Type.Unsafe<"DRAFT" | "SUBMITTED">({
  type: "string",
  enum: ["DRAFT", "SUBMITTED"],
})

const SightingResponseSchema = Type.Object({
  sighting_id: Type.String(),
  walk_id: Type.String(),
  recorded_by_user_id: Type.String(),
  adult_count: Type.Number(),
  juvenile_count: Type.Number(),
  infant_count: Type.Number(),
  behavior: Type.String(),
  notes: Type.String(),
  images_references: Type.Array(Type.String()),
  observation_timestamp: Type.String(),
  last_edited_at: Type.Optional(Type.String()),
  latitude: Type.Number(),
  longitude: Type.Number(),
  submission_status: SubmissionStatusSchema,
})

const CreateSightingBodySchema = Type.Object({
  adult_count: Type.Number(),
  juvenile_count: Type.Number(),
  infant_count: Type.Number(),
  behavior: Type.String(),
  notes: Type.String(),
  images_references: Type.Array(Type.String()),
  observation_timestamp: Type.Optional(Type.String()),
  latitude: Type.Number(),
  longitude: Type.Number(),
})

const UpdateSightingBodySchema = Type.Object({
  adult_count: Type.Optional(Type.Number()),
  juvenile_count: Type.Optional(Type.Number()),
  infant_count: Type.Optional(Type.Number()),
  behavior: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  images_references: Type.Optional(Type.Array(Type.String())),
  observation_timestamp: Type.Optional(Type.String()),
  latitude: Type.Optional(Type.Number()),
  longitude: Type.Optional(Type.Number()),
})

const ErrorSchema = Type.Object({
  error: Type.String(),
})

export async function sightingRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/api/walks/:walkId/sightings",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "createSighting",
        description: "Create a sighting for a walk (group leader only)",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: WalkIdParamsSchema,
        body: CreateSightingBodySchema,
        response: {
          201: SightingResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    createSightingHandler,
  )

  fastify.get(
    "/api/walks/:walkId/sightings",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "listSightingsForWalk",
        description: "List sightings for a walk (participants or admins)",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: WalkIdParamsSchema,
        response: {
          200: Type.Array(SightingResponseSchema),
          401: ErrorSchema,
          403: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    listSightingsHandler,
  )

  fastify.patch(
    "/api/walks/:walkId/sightings/:sightingId",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "updateSighting",
        description: "Update a draft sighting (group leader only)",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: SightingIdParamsSchema,
        body: UpdateSightingBodySchema,
        response: {
          200: SightingResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    updateSightingHandler,
  )

  fastify.delete(
    "/api/walks/:walkId/sightings/:sightingId",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "deleteSighting",
        description: "Delete a draft sighting (group leader only)",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: SightingIdParamsSchema,
        response: {
          204: { type: "null", description: "Sighting deleted" },
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    deleteSightingHandler,
  )

  fastify.post(
    "/api/walks/:walkId/sightings/:sightingId/submit",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "submitSighting",
        description: "Submit a draft sighting and lock it (group leader only)",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: SightingIdParamsSchema,
        response: {
          200: SightingResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    submitSightingHandler,
  )
}
