import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Render as a circle (avatars, icon bubbles). */
  circle?: boolean;
}

/** Layout placeholder with a soft pulse. Decorative: `aria-hidden`. */
export function Skeleton({ circle = false, className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-circle={circle || undefined}
      className={cn(
        'animate-pulse bg-surface-sunken',
        circle ? 'rounded-full' : 'rounded-md',
        className,
      )}
      {...rest}
    />
  );
}
