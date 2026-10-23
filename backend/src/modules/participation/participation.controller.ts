import { FastifyReply, FastifyRequest } from "fastify";
import {
  transferDesignatedSubmitter,
  signUpForWalk,
  withdrawFromWalk,
  enrichParticipationsWithDisabled,
} from "./participation.service";
import { listParticipationsByWalk, listParticipationsByUser } from "./participation.repository";
import { getWalkById } from "../walks/walk.service";
import { config } from "../../config";
import { isAdmin } from "../../services/authorizationService";

/**
 * Maps known service-layer error messages to HTTP status codes.
 * Returns 400 for client errors, 404 for not-found, 500 for anything else.
 */
function classifyError(err: unknown): { statusCode: number; message: string } {
  const message = err instanceof Error ? err.message : "Internal server error";
  if (message === "Walk does not exist" || message === "User is not registered for this walk") {
    return { statusCode: 404, message };
  }
  if (
    message === "Walk is not open for registration" ||
    message === "User already registered for this walk" ||
    message === "Walk is already full" ||
    message === "You are already signed up for another walk on this day" ||
    message === "New designated submitter must be an active participant of this walk" ||
    message === "Deactivated users cannot be assigned as designated submitter"
  ) {
    return { statusCode: 400, message };
  }
  if (message === "Only the current designated submitter or an admin can transfer submitter role") {
    return { statusCode: 403, message };
  }
  return { statusCode: 500, message };
}

/**
 * POST /api/walks/:walkId/participate
 */
export async function participateInWalk(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { walkId } = request.params as { walkId: string };

  const userId = request.user?.uid as string; 

  try {
    const participation = await signUpForWalk({
      walk_id: walkId,
      user_id: userId
    });
    return reply.status(201).send(participation);
  } catch (err) {
    const { statusCode, message } = classifyError(err);
    return reply.status(statusCode).send({ error: message });
  }
}

/**
 * DELETE /api/walks/:walkId/participate
 */
export async function withdrawParticipation(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { walkId } = request.params as { walkId: string };
  const userId = request.user?.uid;

  if (!userId) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  try {
    await withdrawFromWalk(walkId, userId);
    return reply.status(204).send();
  } catch (err) {
    const { statusCode, message } = classifyError(err);
    return reply.status(statusCode).send({ error: message });
  }
}

/**
 * GET /api/walks/:walkId/participants
 */
export async function getWalkParticipants(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { walkId } = request.params as { walkId: string };

  const userId = request.user?.uid as string;
  const userRole = request.user?.role as string;

  const rows = await listParticipationsByWalk(walkId);

  // Allow admins (by role or by bootstrap admin email list)
  const isAdminRole = userRole === "admin";
  const email = (request.user?.email as string | undefined)?.toLowerCase();
  const isAdminEmail = email && config.adminEmails.map((e) => e.toLowerCase()).includes(email);
  if (isAdminRole || isAdminEmail) {
    const participants = await enrichParticipationsWithDisabled(rows);
    return reply.send(participants);
  }

  // Allow participants
  const isParticipant = rows.some(
    (p) => p.user_id === userId
  );

  if (!isParticipant) {
    return reply.status(403).send({
      error: "Forbidden: not a participant"
    });
  }

  const participants = await enrichParticipationsWithDisabled(rows);
  return reply.send(participants);
}

/**
 * GET /api/users/me/walks
 * Returns participations enriched with the walk's metadata so the client can show walk timing and "designated submitter" state.
 */
export async function getMyWalks(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = request.user?.uid as string;

  const participations = await listParticipationsByUser(userId);
  const walkIds = [...new Set(participations.map((p) => p.walk_id))];
  const walks = await Promise.all(walkIds.map((id) => getWalkById(id)));
  const walkMap = new Map(
    walkIds
      .map((id, i) => [id, walks[i]] as const)
      .filter((entry): entry is [string, NonNullable<(typeof walks)[number]>] => entry[1] != null)
  );

  const enriched = participations
    .filter((p) => walkMap.has(p.walk_id))
    .map((p) => {
      const walk = walkMap.get(p.walk_id)!;
      return {
        ...p,
        group_leader_id: walk.group_leader_id ?? null,
        walk_name: walk.name ?? "",
        status: walk.status ?? "UPCOMING",
        walk_date_time: walk.date_time ?? "",
      };
    });

  return reply.send(enriched);
}

/**
 * PATCH /api/walks/:walkId/designated-submitter
 */
export async function updateDesignatedSubmitter(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { walkId } = request.params as { walkId: string };
  const requesterId = request.user?.uid;
  const requester = request.user;

  if (!requesterId || !requester) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const { newSubmitterId } = request.body as { newSubmitterId: string };

  try {
    const walk = await transferDesignatedSubmitter({
      walkId,
      requesterId,
      requesterIsAdmin: isAdmin(requester),
      newSubmitterId,
    });
    return reply.send(walk);
  } catch (err) {
    const { statusCode, message } = classifyError(err);
    return reply.status(statusCode).send({ error: message });
  }
}
