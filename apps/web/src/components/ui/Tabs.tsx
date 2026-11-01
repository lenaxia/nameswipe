import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error(`<${component}> must be used inside <Tabs>`);
  return context;
}

export interface TabsProps {
  /** Controlled active tab. */
  value?: string;
  /** Initial active tab for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

/**
 * Tabs root. Wires controlled/uncontrolled state to TabsList/TabsTrigger/
 * TabsPanel through context. Keyboard interaction follows WAI-ARIA's Tabs
 * pattern: roving tabindex + automatic activation on arrow keys.
 */
export function Tabs({ value, defaultValue, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = useState<string | undefined>(defaultValue);
  const active = value ?? internal;
  const baseId = useId();

  if (active === undefined) {
    throw new Error('<Tabs> needs `value` or `defaultValue`');
  }

  const setValue = (next: string) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value: active, setValue, baseId }}>
      <div className={cn('flex flex-col gap-md', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const TAB_SELECTOR = '[role="tab"]:not(:disabled)';

export function TabsList({ children, onKeyDown, className, ...rest }: TabsListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { setValue } = useTabs('TabsList');

  const enabledTabs = () =>
    Array.from(ref.current?.querySelectorAll<HTMLButtonElement>(TAB_SELECTOR) ?? []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    const tabs = enabledTabs();
    if (tabs.length === 0) return;
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
    let next: HTMLButtonElement | undefined;
    switch (event.key) {
      case 'ArrowRight':
        next = tabs[currentIndex < 0 ? 0 : (currentIndex + 1) % tabs.length];
        break;
      case 'ArrowLeft':
        next =
          tabs[currentIndex < 0 ? tabs.length - 1 : (currentIndex - 1 + tabs.length) % tabs.length];
        break;
      case 'Home':
        next = tabs[0];
        break;
      case 'End':
        next = tabs[tabs.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    setValue(next.dataset.value ?? '');
    next.focus();
  };

  return (
    <div
      ref={ref}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex max-w-full gap-xs overflow-x-auto rounded-lg bg-surface-sunken p-xs',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  value: string;
  disabled?: boolean;
  children: ReactNode;
}

export function TabsTrigger({ value, disabled, children, className, ...rest }: TabsTriggerProps) {
  const { value: active, setValue, baseId } = useTabs('TabsTrigger');
  const selected = active === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      data-value={value}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      aria-disabled={disabled || undefined}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn(
        'shrink-0 rounded-md px-md py-sm text-sm font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        selected
          ? 'bg-surface-raised text-brand-700 shadow-xs'
          : 'text-ink-secondary hover:text-ink',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface TabsPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  children: ReactNode;
}

export function TabsPanel({ value, children, className, ...rest }: TabsPanelProps) {
  const { value: active, baseId } = useTabs('TabsPanel');
  const isActive = active === value;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      hidden={!isActive}
      className={cn(
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-md',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
