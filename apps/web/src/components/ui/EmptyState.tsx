import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  /** Decorative icon; shown inside a soft bubble. */
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** Action slot — usually a Button. */
  action?: ReactNode;
  /** Heading level for the title. */
  as?: 'h2' | 'h3' | 'h4' | 'p';
  className?: string;
}

/** Friendly placeholder for empty lists/screens. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  as: Heading = 'h3',
  className,
}: EmptyStateProps) {
  return (
    <section
      className={cn('flex flex-col items-center gap-lg px-xl py-3xl text-center', className)}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="flex h-bubble w-bubble items-center justify-center rounded-full bg-brand-50 text-brand-500"
        >
          {icon}
        </span>
      )}
      <div className="flex max-w-modal flex-col items-center gap-sm">
        <Heading className="text-lg font-semibold text-ink">{title}</Heading>
        {body && <p className="text-sm text-ink-secondary">{body}</p>}
      </div>
      {action && <div className="flex items-center gap-sm">{action}</div>}
    </section>
  );
}
