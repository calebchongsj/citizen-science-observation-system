import { Type } from '@sinclair/typebox'
import { FastifyInstance } from "fastify"

import {
  createWalkHandler,
  listWalksHandler,
  getWalkHandler,
  updateWalkHandler,
  deleteWalkHandler,
  startWalkHandler,
  endWalkHandler,
} from "./walk.controller"

import {
  CreateWalkBodySchema,
  CreateWalkResponseSchema,
  UpdateWalkBodySchema,
  WalkResponseSchema,
  ListWalksResponseSchema,
} from "./walk.schema"

import { 
  verifyToken, 
  requireAdminEmail 
} from "../../middleware/auth.middleware";

export async function walkRoutes(fastify: FastifyInstance) {

  // Create walk (admin only)
  fastify.post(
    "/api/walks",
    {
      preHandler: [verifyToken, requireAdminEmail],
      schema: {
        operationId: 'createWalk',
        description: 'Create a new survey walk (admin only)',
        tags: ['RafflesGo'],
        security: [{ bearerAuth: [] }],
        body: CreateWalkBodySchema,
        response: { 201: CreateWalkResponseSchema },
      },
    },
    createWalkHandler
  )

  // View all walks (authenticated users)
  fastify.get(
    "/api/walks",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: 'listWalks',
        description: 'List all walks',
        tags: ['RafflesGo'],
        security: [{ bearerAuth: [] }],
        response: { 200: ListWalksResponseSchema },
      },
    },
    listWalksHandler
  )

  // Get walk by ID (authenticated users)
  fastify.get(
    "/api/walks/:id",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: 'getWalkById',
        description: 'Get walk by ID',
        tags: ['RafflesGo'],
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Type.String() }),
        response: { 200: WalkResponseSchema },
      },
    },
    getWalkHandler
  )

  // Update walk (admin only)
  fastify.patch(
    "/api/walks/:id",
    {
      preHandler: [verifyToken, requireAdminEmail],
      schema: {
        operationId: 'updateWalk',
        description: 'Update a walk (admin only)',
        tags: ['RafflesGo'],
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Type.String() }),
        body: UpdateWalkBodySchema,
        response: { 200: WalkResponseSchema },
      },
    },
    updateWalkHandler
  )

  // Delete walk (admin only)
  fastify.delete(
    "/api/walks/:id",
    {
      preHandler: [verifyToken, requireAdminEmail],
      schema: {
        operationId: 'deleteWalk',
        description: 'Delete a walk (admin only)',
        tags: ['RafflesGo'],
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Type.String() }),
        response: { 204: Type.Null() },
      },
    },
    deleteWalkHandler
  )

  // Start walk (admin or designated submitter; UPCOMING and scheduled time passed)
  fastify.post(
    "/api/walks/:id/start",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: 'startWalk',
        description: 'Start a walk (admin or designated submitter only)',
        tags: ['RafflesGo'],
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Type.String() }),
        response: { 200: WalkResponseSchema },
      },
    },
    startWalkHandler
  )

  // End walk (admin or designated submitter; IN_PROGRESS only)
  fastify.post(
    "/api/walks/:id/end",
    {
      preHandler: [verifyToken],
      schema: {
        operationId: 'endWalk',
        description: 'End a walk (admin or designated submitter only)',
        tags: ['RafflesGo'],
        security: [{ bearerAuth: [] }],
        params: Type.Object({ id: Type.String() }),
        response: { 200: WalkResponseSchema },
      },
    },
    endWalkHandler
  )

}
