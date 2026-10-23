import { Type } from '@sinclair/typebox'

const RouteInfoSchema = Type.Array(Type.Tuple([Type.Number(), Type.Number()]))
const WeekdaySchema = Type.Union([
  Type.Literal('SUNDAY'),
  Type.Literal('MONDAY'),
  Type.Literal('TUESDAY'),
  Type.Literal('WEDNESDAY'),
  Type.Literal('THURSDAY'),
  Type.Literal('FRIDAY'),
  Type.Literal('SATURDAY'),
])
const WalkRecurrenceSchema = Type.Object({
  repeat_weekday: WeekdaySchema,
  end_date: Type.String(),
})

export const CreateWalkBodySchema = Type.Object({
  route_info: RouteInfoSchema,
  date_time: Type.String(),
  scheduled_end_time: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  max_slots: Type.Number({ minimum: 1 }),
  name: Type.Optional(Type.String()),
  recurrence: Type.Optional(WalkRecurrenceSchema),
})

export const UpdateWalkBodySchema = Type.Object({
  route_info: RouteInfoSchema,
  date_time: Type.String(),
  scheduled_end_time: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  max_slots: Type.Number({ minimum: 1 }),
  name: Type.Optional(Type.String()),
})

export const WalkParticipantPublicSchema = Type.Object({
  user_id: Type.String(),
  display_name: Type.String(),
  is_designated_submitter: Type.Boolean(),
  disabled: Type.Boolean(),
})

export const WalkResponseSchema = Type.Object({
  walk_id: Type.String(),
  route_info: RouteInfoSchema,
  date_time: Type.String(),
  scheduled_end_time: Type.Optional(Type.String()),
  max_slots: Type.Number(),
  group_leader_id: Type.Union([Type.String(), Type.Null()]),
  status: Type.Union([
    Type.Literal('UPCOMING'),
    Type.Literal('IN_PROGRESS'),
    Type.Literal('COMPLETED'),
    Type.Literal('ABANDONED'),
  ]),
  has_sightings: Type.Boolean(),
  name: Type.Optional(Type.String()),
  started_at: Type.Optional(Type.String()),
  ended_at: Type.Optional(Type.String()),
  current_participant_count: Type.Optional(Type.Number()),
  participants: Type.Optional(Type.Array(WalkParticipantPublicSchema)),
})

export const ListWalksResponseSchema = Type.Array(WalkResponseSchema)

export const CreateWalkResponseSchema = Type.Object({
  walks: Type.Array(WalkResponseSchema),
  created_count: Type.Number(),
})
