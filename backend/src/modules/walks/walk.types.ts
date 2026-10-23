export enum WalkStatus {
  UPCOMING = "UPCOMING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  ABANDONED = "ABANDONED"
}

export interface Walk {
  walk_id: string
  route_info: [number, number][]
  date_time: string
  scheduled_end_time?: string
  max_slots: number
  group_leader_id: string | null
  status: WalkStatus
  has_sightings: boolean
  name?: string
  started_at?: string
  ended_at?: string
  current_participant_count?: number
}

/** Public participant row on walk detail (no email or other PII). */
export interface WalkParticipantPublic {
  user_id: string
  display_name: string
  is_designated_submitter: boolean
  disabled: boolean
}

export type WalkDetailForApi = Walk & {
  current_participant_count: number
  participants: WalkParticipantPublic[]
}