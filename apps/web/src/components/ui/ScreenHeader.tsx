import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { ChevronLeftIcon } from './icons';
import { IconButton } from './IconButton';

export interface ScreenHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Renders a back button when provided. */
  onBack?: () => void;
  /** Accessible name for the back button. */
  backLabel?: string;
  /** Right-aligned action slot. */
  actions?: ReactNode;
  className?: string;
}

/** Top bar for a screen: optional back arrow, title/subtitle, actions. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  actions,
  className,
}: ScreenHeaderProps) {
  return (
    <header
      className={cn('sticky top-0 z-10 flex items-center gap-md bg-surface px-lg py-md', className)}
    >
      {onBack && (
        <IconButton
          variant="ghost"
          aria-label={backLabel}
          onClick={onBack}
          className="-ml-xs shrink-0"
        >
          <ChevronLeftIcon />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="truncate text-sm text-ink-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-sm">{actions}</div>}
    </header>
  );
}
