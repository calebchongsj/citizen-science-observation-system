/**
 * Human-readable labels and CSS classes for walk status.
 */
export type WalkStatusValue = 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
export type WalkStatusTagVariant = 'upcoming' | 'in-progress' | 'completed' | 'abandoned';

export function formatWalkStatus(status: string): string {
  switch (status) {
    case 'UPCOMING':
      return 'Upcoming';
    case 'IN_PROGRESS':
      return 'In progress';
    case 'COMPLETED':
      return 'Completed';
    case 'ABANDONED':
      return 'Not completed';
    default:
      return status;
  }
}

export function getWalkStatusTagVariant(status: string): WalkStatusTagVariant {
  switch (status) {
    case 'UPCOMING':
      return 'upcoming';
    case 'IN_PROGRESS':
      return 'in-progress';
    case 'COMPLETED':
      return 'completed';
    case 'ABANDONED':
      return 'abandoned';
    default:
      return 'abandoned';
  }
}
