import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { buttonVariantClasses, type ButtonSize, type ButtonVariant } from './Button';
import { Spinner } from './Spinner';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  /** Required: icon-only controls must have an accessible name. */
  'aria-label': string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-control-sm w-control-sm',
  md: 'h-control-md w-control-md',
  lg: 'h-control-lg w-control-lg',
};

/**
 * Circular icon-only button. `aria-label` is mandatory by design — an
 * unlabeled icon button is an automatic a11y failure.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant = 'ghost',
    size = 'md',
    loading = false,
    loadingLabel = 'Loading…',
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
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full p-0 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:pointer-events-none disabled:opacity-50',
        buttonVariantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={size} label={loadingLabel} />
      ) : (
        <span aria-hidden="true" className="inline-flex">
          {children}
        </span>
      )}
    </button>
  );
});

export type { ButtonSize, ButtonVariant };
