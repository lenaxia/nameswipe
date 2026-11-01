import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets `aria-busy` and blocks interaction. */
  loading?: boolean;
  /** Screen-reader text announced while loading. */
  loadingLabel?: string;
  /** Leading decorative icon. */
  icon?: ReactNode;
}

const baseClasses =
  'inline-flex select-none items-center justify-center font-medium transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
  'disabled:pointer-events-none disabled:opacity-50';

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-ink-inverse shadow-sm hover:bg-brand-600 active:bg-brand-700',
  secondary:
    'border border-line-strong bg-surface-raised text-ink shadow-xs hover:bg-surface-sunken active:bg-surface-sunken',
  ghost: 'text-brand-600 hover:bg-brand-50 active:bg-brand-100',
  danger: 'bg-danger-500 text-ink-inverse shadow-sm hover:bg-danger-600 active:bg-danger-700',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-control-sm gap-xs rounded-md px-md text-sm',
  md: 'h-control-md gap-sm rounded-lg px-lg text-base',
  lg: 'h-control-lg gap-md rounded-xl px-xl text-lg',
};

/**
 * The action button. Always a `<button>` element — render an anchor styled
 * like a button by composing variants if links are ever needed.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingLabel = 'Loading…',
    icon,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const inert = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={inert}
      aria-busy={loading || undefined}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      className={cn(baseClasses, buttonVariantClasses[variant], sizeClasses[size], className)}
      {...rest}
    >
      {loading ? (
        <Spinner size={size} label={loadingLabel} />
      ) : (
        icon && (
          <span aria-hidden="true" className="inline-flex shrink-0">
            {icon}
          </span>
        )
      )}
      {children}
    </button>
  );
});
