/**
 * Centralized Firestore collection name constants
 * Ensures consistency across all repositories and tests
 */

export const FIRESTORE_COLLECTIONS = {
  USERS: 'users',
  WALKS: 'walks',
  WALK_PARTICIPATIONS: 'walk_participations',
  SIGHTINGS: 'sightings',
  NOTIFICATION_JOBS: 'notification_jobs',
} as const;
