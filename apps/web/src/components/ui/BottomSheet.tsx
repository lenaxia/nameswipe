import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { useMediaQuery } from '../../lib/useMediaQuery';

const DESKTOP_QUERY = '(min-width: 48rem)'; /* mirrors Tailwind md: (768px) */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Rendered as the dialog title (and `aria-labelledby` target). */
  title?: ReactNode;
  /** Accessible name when no title is provided. */
  'aria-label'?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Bottom sheet on mobile (< 768px) → centered modal at ≥ 768px.
 * Presentation mode comes from `useMediaQuery` so JS behavior and CSS
 * layout never diverge; `data-mode` reflects it for tests/e2e.
 *
 * A11y contract: focus moves into the dialog on open and is returned to
 * the opener on close; Tab is trapped inside; Escape and scrim click
 * close; body scroll is locked while open; `aria-modal` + labelled title.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  'aria-label': ariaLabel,
  children,
  className,
}: BottomSheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const mode = isDesktop ? 'modal' : 'sheet';
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;

    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusables && focusables.length > 0 ? focusables[0] : dialogRef.current)?.focus();

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      // runtime-px: scrollbar compensation is inherently dynamic
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        data-testid="bottom-sheet-overlay"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-scrim"
      />
      <div
        data-testid="bottom-sheet-placement"
        className={cn(
          'flex h-full w-full items-end justify-center',
          isDesktop && 'items-center p-lg',
        )}
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-label={title ? undefined : ariaLabel}
          aria-hidden={false}
          tabIndex={-1}
          data-mode={mode}
          onKeyDown={trapTab}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'w-full bg-surface-raised text-ink shadow-xl outline-none',
            isDesktop
              ? 'max-w-modal animate-modal-in rounded-2xl p-xl'
              : 'animate-sheet-in rounded-t-2xl px-lg pb-xl pt-lg',
            className,
          )}
        >
          {!isDesktop && (
            <span
              aria-hidden="true"
              data-testid="bottom-sheet-handle"
              className="mx-auto mb-lg block h-1 w-10 rounded-full bg-line-strong"
            />
          )}
          {title && (
            <h2 id={titleId} className="mb-lg text-lg font-semibold text-ink">
              {title}
            </h2>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
