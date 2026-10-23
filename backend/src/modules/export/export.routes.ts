import { Type } from "@sinclair/typebox"
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { AppError } from "../../lib/errors"
import { requireAdminEmail, verifyToken } from "../../middleware/auth.middleware"
import { exportSurveyData } from "./export.service"

const QuerystringSchema = Type.Object({
  format: Type.Optional(Type.String()),
  walkId: Type.Optional(Type.String()),
  startDate: Type.Optional(Type.String()),
  endDate: Type.Optional(Type.String()),
  anonymize: Type.Optional(Type.Boolean()),
})

const ErrorSchema = Type.Object({
  error: Type.String(),
})

async function exportSurveyDataHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { format } = request.query as { format?: string }
  const query = request.query as {
    format?: string
    walkId?: string
    startDate?: string
    endDate?: string
    anonymize?: boolean
  }

  try {
    const file = await exportSurveyData({
      format: format === "csv" || format === undefined ? format : (format as "csv"),
      walkId: query.walkId,
      startDate: query.startDate,
      endDate: query.endDate,
      anonymize: query.anonymize,
    })
    reply.header("Content-Type", file.contentType)
    reply.header("Content-Disposition", `attachment; filename="${file.filename}"`)
    return reply.send(file.content)
  } catch (err) {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: err.message })
    }

    const message = err instanceof Error ? err.message : "Internal server error"
    return reply.status(500).send({ error: message })
  }
}

export async function exportRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/admin/export",
    {
      preHandler: [verifyToken, requireAdminEmail],
      schema: {
        operationId: "exportSurveyData",
        description: "Export survey sighting data as a CSV file (admin only)",
        tags: ["RafflesGo"],
        security: [{ bearerAuth: [] }],
        querystring: QuerystringSchema,
        produces: ["text/csv"],
        response: {
          200: Type.String({
            description: "CSV file contents",
          }),
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    exportSurveyDataHandler,
  )
}
