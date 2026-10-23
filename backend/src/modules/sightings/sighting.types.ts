export type SubmissionStatus = 'DRAFT' | 'SUBMITTED';

export interface Sighting {
  sighting_id: string;
  walk_id: string;
  recorded_by_user_id: string;
  adult_count: number;
  juvenile_count: number;
  infant_count: number;
  behavior: string;
  notes: string;
  images_references: string[];
  observation_timestamp: string;
  /**
   * When the sighting draft was last edited (including image additions and submit).
   * Stored as ISO string.
   */
  last_edited_at?: string;
  latitude: number;
  longitude: number;
  submission_status: SubmissionStatus;
}

