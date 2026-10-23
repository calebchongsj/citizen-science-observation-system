import { FastifyReply, FastifyRequest } from "fastify"
import { AppError } from "../../lib/errors"
import * as authorizationService from "../../services/authorizationService"
import {
  createSightingForWalk,
  deleteSighting,
  listSightingsForWalk,
  submitSighting,
  updateSightingDraft,
} from "./sighting.service"

function mapError(reply: FastifyReply, err: unknown) {
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({ error: err.message })
  }

  const message = err instanceof Error ? err.message : "Internal server error"
  return reply.status(500).send({ error: message })
}

/**
 * POST /api/walks/:walkId/sightings
 */
export async function createSightingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { walkId } = request.params as { walkId: string }
  const userId = request.user?.uid

  if (!userId) {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  const isLeader = await authorizationService.isGroupLeader(userId, walkId)
  if (!isLeader) {
    return reply.status(403).send({
      error: "Only the group leader can record sightings",
    })
  }

  const body = request.body as {
    adult_count: number
    juvenile_count: number
    infant_count: number
    behavior: string
    notes: string
    images_references: string[]
    observation_timestamp?: string
    latitude: number
    longitude: number
  }

  try {
    const sighting = await createSightingForWalk({
      walkId,
      userId,
      input: body,
    })

    return reply.status(201).send(sighting)
  } catch (err) {
    return mapError(reply, err)
  }
}

/**
 * GET /api/walks/:walkId/sightings
 */
export async function listSightingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { walkId } = request.params as { walkId: string }
  const userId = request.user?.uid

  if (!userId) {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  const user = request.user
  if (!user) {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  if (!authorizationService.isAdmin(user)) {
    const participant = await authorizationService.isWalkParticipant(userId, walkId)
    if (!participant) {
      return reply.status(403).send({
        error: "You are not a participant of this walk",
      })
    }
  }

  try {
    const sightings = await listSightingsForWalk({
      walkId,
      userId,
      role: request.user?.role,
      email: request.user?.email,
    })

    return reply.send(sightings)
  } catch (err) {
    return mapError(reply, err)
  }
}

/**
 * PATCH /api/walks/:walkId/sightings/:sightingId
 */
export async function updateSightingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { walkId, sightingId } = request.params as {
    walkId: string
    sightingId: string
  }
  const userId = request.user?.uid

  if (!userId) {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  const isLeader = await authorizationService.isGroupLeader(userId, walkId)
  if (!isLeader) {
    return reply.status(403).send({
      error: "Only the group leader can modify sightings",
    })
  }

  const body = request.body as {
    adult_count?: number
    juvenile_count?: number
    infant_count?: number
    behavior?: string
    notes?: string
    images_references?: string[]
    observation_timestamp?: string
    latitude?: number
    longitude?: number
  }

  try {
    const sighting = await updateSightingDraft({
      walkId,
      sightingId,
      userId,
      input: body,
    })

    return reply.send(sighting)
  } catch (err) {
    return mapError(reply, err)
  }
}

/**
 * POST /api/walks/:walkId/sightings/:sightingId/submit
 */
export async function submitSightingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { walkId, sightingId } = request.params as {
    walkId: string
    sightingId: string
  }
  const userId = request.user?.uid

  if (!userId) {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  const isLeader = await authorizationService.isGroupLeader(userId, walkId)
  if (!isLeader) {
    return reply.status(403).send({
      error: "Only the group leader can submit sightings",
    })
  }

  try {
    const sighting = await submitSighting({
      walkId,
      sightingId,
      userId,
    })

    return reply.send(sighting)
  } catch (err) {
    return mapError(reply, err)
  }
}

/**
 * DELETE /api/walks/:walkId/sightings/:sightingId
 */
export async function deleteSightingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { walkId, sightingId } = request.params as {
    walkId: string
    sightingId: string
  }
  const userId = request.user?.uid

  if (!userId) {
    return reply.status(401).send({ error: "Unauthorized" })
  }

  const isLeader = await authorizationService.isGroupLeader(userId, walkId)
  if (!isLeader) {
    return reply.status(403).send({
      error: "Only the group leader can delete sightings",
    })
  }

  try {
    await deleteSighting({
      walkId,
      sightingId,
      userId,
    })

    return reply.status(204).send()
  } catch (err) {
    return mapError(reply, err)
  }
}
