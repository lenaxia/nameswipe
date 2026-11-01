import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { XIcon } from './icons';

export interface ChipProps {
  /** Visible label; strings double as the remove-button name. */
  label: ReactNode;
  selected?: boolean;
  /** Provide to make the chip selectable (toggle). */
  onToggle?: () => void;
  /** Provide to render a remove control. */
  onRemove?: () => void;
  disabled?: boolean;
  leadingIcon?: ReactNode;
  className?: string;
}

const removeName = (label: ReactNode) => (typeof label === 'string' ? `Remove ${label}` : 'Remove');

/**
 * Compact tag/filter control. Selectable chips expose `aria-pressed`;
 * removable chips carry a dedicated labeled remove button (never nested).
 */
export function Chip({
  label,
  selected = false,
  onToggle,
  onRemove,
  disabled = false,
  leadingIcon,
  className,
}: ChipProps) {
  const interactive = Boolean(onToggle);
  return (
    <span
      data-selected={selected || undefined}
      data-disabled={disabled || undefined}
      data-removable={onRemove ? true : undefined}
      className={cn(
        'inline-flex items-center overflow-hidden rounded-full border transition-colors duration-150',
        selected
          ? 'border-transparent bg-brand-500 text-ink-inverse shadow-xs'
          : 'border-line-strong bg-surface-raised text-ink-secondary shadow-xs hover:border-brand-300 hover:text-ink',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {interactive ? (
        <button
          type="button"
          disabled={disabled}
          aria-pressed={selected}
          onClick={onToggle}
          className="inline-flex items-center gap-xs py-sm pl-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none"
        >
          {leadingIcon && (
            <span aria-hidden="true" className="inline-flex">
              {leadingIcon}
            </span>
          )}
          {label}
        </button>
      ) : (
        <span
          className={cn(
            'inline-flex items-center gap-xs py-sm pl-lg text-sm font-medium',
            onRemove ? 'pr-xs' : 'pr-lg',
          )}
        >
          {leadingIcon && (
            <span aria-hidden="true" className="inline-flex">
              {leadingIcon}
            </span>
          )}
          {label}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          disabled={disabled}
          aria-label={removeName(label)}
          onClick={onRemove}
          className="mr-xs inline-flex items-center justify-center rounded-full p-xs transition-colors duration-150 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none"
        >
          <XIcon className="h-icon-sm w-icon-sm" />
        </button>
      )}
    </span>
  );
}
