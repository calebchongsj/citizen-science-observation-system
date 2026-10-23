import { FastifyReply, FastifyRequest } from "fastify"
import * as walkService from "./walk.service"
import * as authorizationService from "../../services/authorizationService"
import { AppError } from "../../lib/errors"

/**
 * POST /api/walks
 * Create a new survey walk
 */
export async function createWalkHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const body = request.body as {
    route_info: [number, number][]
    date_time: string
    scheduled_end_time?: string | null
    max_slots: number
    name?: string
    recurrence?: {
      repeat_weekday: "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY"
      end_date: string
    }
  }

  try {
    const walks = await walkService.createWalks(body)
    return reply.code(201).send({ walks, created_count: walks.length })
  } catch (err) {
    return mapError(reply, err)
  }
}

/**
 * GET /api/walks
 * List all walks
 */
export async function listWalksHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const walks = await walkService.listWalks()

  return reply.send(walks)
}

/**
 * GET /api/walks/:id
 * Get walk details
 */
export async function getWalkHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const params = request.params as { id: string }

  const walk = await walkService.getWalkDetailForApi(params.id)

  if (!walk) {
    return reply.code(404).send({ message: "Walk not found" })
  }

  return reply.send(walk)
}

/**
 * PATCH /api/walks/:id
 * Update a walk (admin only)
 */
export async function updateWalkHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const params = request.params as { id: string }
  const body = request.body as {
    route_info: [number, number][]
    date_time: string
    scheduled_end_time?: string | null
    max_slots: number
    name?: string
  }

  try {
    const walk = await walkService.updateWalk(params.id, body)

    if (!walk) {
      return reply.code(404).send({ message: "Walk not found" })
    }

    return reply.send(walk)
  } catch (err) {
    return mapError(reply, err)
  }
}

/**
 * DELETE /api/walks/:id
 * Delete a walk (admin only)
 */
export async function deleteWalkHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const params = request.params as { id: string }

  const deleted = await walkService.deleteWalk(params.id)

  if (!deleted) {
    return reply.code(404).send({ message: "Walk not found" })
  }

  return reply.code(204).send()
}

function mapError(reply: FastifyReply, err: unknown) {
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({ message: err.message })
  }
  const message = err instanceof Error ? err.message : "Internal server error"
  return reply.status(500).send({ message })
}

/**
 * POST /api/walks/:id/start
 * Start a walk (admin or designated submitter only; only when UPCOMING and scheduled time has passed)
 */
export async function startWalkHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const params = request.params as { id: string }
  const user = request.user

  if (!user?.uid) {
    return reply.status(401).send({ message: "Unauthorized" })
  }

  const isAdmin = authorizationService.isAdmin(user)
  const isLeader = await authorizationService.isGroupLeader(user.uid, params.id)
  if (!isAdmin && !isLeader) {
    return reply.status(403).send({ message: "Only admin or the designated submitter can start this walk" })
  }

  try {
    const walk = await walkService.startWalk(params.id)
    return reply.send(walk)
  } catch (err) {
    return mapError(reply, err)
  }
}

/**
 * POST /api/walks/:id/end
 * End a walk (admin or designated submitter only; only when IN_PROGRESS)
 */
export async function endWalkHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const params = request.params as { id: string }
  const user = request.user

  if (!user?.uid) {
    return reply.status(401).send({ message: "Unauthorized" })
  }

  const isAdmin = authorizationService.isAdmin(user)
  const isLeader = await authorizationService.isGroupLeader(user.uid, params.id)
  if (!isAdmin && !isLeader) {
    return reply.status(403).send({ message: "Only admin or the designated submitter can end this walk" })
  }

  try {
    const walk = await walkService.endWalk(params.id)
    return reply.send(walk)
  } catch (err) {
    return mapError(reply, err)
  }
}
