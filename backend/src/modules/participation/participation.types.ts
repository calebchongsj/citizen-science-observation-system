export type AttendanceStatus = 'REGISTERED' | 'ATTENDED' | 'ABSENT';

export interface Participation {
  participation_id: string;
  walk_id: string;
  user_id: string;
  attendance_status: AttendanceStatus;
  created_at: number;
}

export type CreateParticipationInput = {
  walk_id: string;
  user_id: string;
};