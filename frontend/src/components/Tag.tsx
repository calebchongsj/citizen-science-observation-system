import type { ReactNode } from 'react';

export type TagVariant =
  | 'walk-type'
  | 'upcoming'
  | 'in-progress'
  | 'completed'
  | 'abandoned'
  | 'signed-up'
  | 'submitter'
  | 'designated-submitter'
  | 'registered'
  | 'attended'
  | 'absent'
  | 'walk-full'
  | 'deactivated';

type TagProps = {
  variant: TagVariant;
  children: ReactNode;
  title?: string;
};

export function Tag({ variant, children, title }: TagProps) {
  return (
    <span className={`tag tag--${variant}`} title={title}>
      {children}
    </span>
  );
}
