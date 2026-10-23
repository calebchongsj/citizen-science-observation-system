import { Type } from "@sinclair/typebox"
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { verifyToken } from "../middleware/auth.middleware"
import * as authorizationService from "../services/authorizationService"
import { generateUploadUrl } from "../services/imageUploadService"
import { addImageReference } from "../modules/sightings/sighting.service"
import { AppError } from "../lib/errors"

const WalkSightingParamsSchema = Type.Object({
  walkId: Type.String(),
  sightingId: Type.String(),
})

const UploadUrlBodySchema = Type.Object({
  filename: Type.String(),
  contentType: Type.String(),
})

const UploadUrlResponseSchema = Type.Object({
  uploadUrl: Type.String(),
  storagePath: Type.String(),
  downloadUrl: Type.String(),
})

const AddImageBodySchema = Type.Object({
  imageUrl: Type.String(),
})

const ErrorSchema = Type.Object({
  error: Type.String(),
})

function mapError(reply: FastifyReply, err: unknown) {
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({ error: err.message })
  }

  const message = err instanceof Error ? err.message : "Internal server error"
  return reply.status(500).send({ error: message })
}

export async function imageUploadRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/api/walks/:walkId/sightings/:sightingId/upload-url",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "generateSightingImageUploadUrl",
        description: "Generate a signed upload URL for a sighting image (group leader only)",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: WalkSightingParamsSchema,
        body: UploadUrlBodySchema,
        response: {
          200: UploadUrlResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { walkId, sightingId } = request.params as {
        walkId: string
        sightingId: string
      }
      const { filename, contentType } = request.body as {
        filename: string
        contentType: string
      }
      const userId = request.user?.uid

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" })
      }

      const leader = await authorizationService.isGroupLeader(userId, walkId)
      if (!leader) {
        return reply.status(403).send({
          error: "Only the group leader can request upload URLs",
        })
      }

      try {
        const result = await generateUploadUrl(walkId, sightingId, filename, contentType)
        return reply.send(result)
      } catch (err) {
        return mapError(reply, err)
      }
    },
  )

  fastify.post(
    "/api/walks/:walkId/sightings/:sightingId/images",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: "addSightingImageReference",
        description: "Persist uploaded image URL into sightings.images_references (group leader only)",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        params: WalkSightingParamsSchema,
        body: AddImageBodySchema,
        response: {
          200: Type.Object({
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
            submission_status: Type.Unsafe<"DRAFT" | "SUBMITTED">({
              type: "string",
              enum: ["DRAFT", "SUBMITTED"],
            }),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { walkId, sightingId } = request.params as {
        walkId: string
        sightingId: string
      }
      const { imageUrl } = request.body as {
        imageUrl: string
      }
      const userId = request.user?.uid

      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" })
      }

      const leader = await authorizationService.isGroupLeader(userId, walkId)
      if (!leader) {
        return reply.status(403).send({
          error: "Only the group leader can modify sightings",
        })
      }

      try {
        const sighting = await addImageReference({
          walkId,
          sightingId,
          userId,
          imageUrl,
        })
        return reply.send(sighting)
      } catch (err) {
        return mapError(reply, err)
      }
    },
  )
}
