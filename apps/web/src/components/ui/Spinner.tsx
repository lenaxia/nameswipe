import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-icon-sm w-icon-sm',
  md: 'h-icon-md w-icon-md',
  lg: 'h-icon-lg w-icon-lg',
};

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** Accessible announcement; rendered visually-hidden. */
  label?: string;
  size?: SpinnerSize;
}

/**
 * Loading indicator. Announced as `role="status"` so screen readers pick
 * up the label; the SVG itself is decorative.
 */
export function Spinner({ label = 'Loading…', size = 'md', className, ...rest }: SpinnerProps) {
  return (
    <span
      role="status"
      data-size={size}
      className={cn('inline-flex items-center justify-center', className)}
      {...rest}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className={cn('animate-spin', sizeClasses[size])}
        aria-hidden="true"
        data-testid="spinner"
      >
        <circle cx="12" cy="12" r="9" strokeWidth="3" className="opacity-25" />
        <circle
          cx="12"
          cy="12"
          r="9"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="75 25"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
