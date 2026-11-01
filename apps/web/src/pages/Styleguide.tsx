import { useState, type ReactNode } from 'react';
import {
  Button,
  Chip,
  EmptyState,
  HeartIcon,
  IconButton,
  SearchIcon,
  Skeleton,
  SparklesIcon,
  Spinner,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  BottomSheet,
  ScreenHeader,
} from '../components/ui';
import { Link } from '../lib/router';
import { cn } from '../lib/cn';

/* ─────────────────────────── page furniture ─────────────────────────── */

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex flex-col gap-lg">
      <div className="flex flex-col gap-xs">
        <h2 id={`${id}-heading`} className="text-2xl font-bold text-ink">
          {title}
        </h2>
        {hint && <p className="text-sm text-ink-secondary">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-lg rounded-xl border border-line bg-surface-raised p-lg',
        className,
      )}
    >
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-md">{children}</div>
    </div>
  );
}

function Swatch({ token, textDark }: { token: string; textDark?: boolean }) {
  return (
    <div className="flex flex-col gap-xs">
      <div
        className={cn('h-10 w-full rounded-md border border-line', textDark && 'text-ink')}
        style={{ backgroundColor: `var(${token})` }}
      />
      <code className="text-xs text-ink-muted">{token.replace('--color-', '')}</code>
    </div>
  );
}

/* ─────────────────────────── token sections ─────────────────────────── */

const SCALES: Array<{ name: string; steps: number[] }> = [
  { name: 'brand', steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'accent', steps: [50, 100, 200, 300, 400, 500, 600, 700] },
  { name: 'success', steps: [50, 100, 200, 300, 400, 500, 600, 700] },
  { name: 'danger', steps: [50, 100, 200, 300, 400, 500, 600, 700] },
];

const SEMANTIC_COLORS = [
  '--color-surface',
  '--color-surface-raised',
  '--color-surface-sunken',
  '--color-ink',
  '--color-ink-secondary',
  '--color-ink-muted',
  '--color-ink-inverse',
  '--color-line',
  '--color-line-strong',
  '--color-scrim',
  '--color-focus',
];

const TYPE_SCALE = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'] as const;

const SPACINGS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const;
const RADII = ['sm', 'md', 'lg', 'xl', '2xl'] as const;
const SHADOWS = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

/* ─────────────────────────── interactive demos ──────────────────────── */

function ButtonsDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <Frame>
      {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
        <Row key={variant} label={variant}>
          <Button variant={variant} size="sm">
            Small
          </Button>
          <Button variant={variant} size="md">
            Medium
          </Button>
          <Button variant={variant} size="lg">
            Large
          </Button>
          <Button variant={variant} disabled>
            Disabled
          </Button>
          <Button
            variant={variant}
            loading={loading}
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1500);
            }}
          >
            {loading ? 'Working…' : 'Try me'}
          </Button>
        </Row>
      ))}
      <Row label="with icon">
        <Button icon={<HeartIcon />}>Match</Button>
        <Button variant="secondary" icon={<SearchIcon />}>
          Browse names
        </Button>
      </Row>
    </Frame>
  );
}

function IconButtonsDemo() {
  return (
    <Frame>
      {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
        <Row key={variant} label={variant}>
          <IconButton variant={variant} size="sm" aria-label={`${variant} small action`}>
            <HeartIcon />
          </IconButton>
          <IconButton variant={variant} size="md" aria-label={`${variant} medium action`}>
            <HeartIcon />
          </IconButton>
          <IconButton variant={variant} size="lg" aria-label={`${variant} large action`}>
            <HeartIcon />
          </IconButton>
          <IconButton variant={variant} aria-label={`${variant} disabled action`} disabled>
            <HeartIcon />
          </IconButton>
        </Row>
      ))}
    </Frame>
  );
}

function ChipsDemo() {
  const [selected, setSelected] = useState<Record<string, boolean>>({ Ada: true });
  const [names, setNames] = useState(['Ada', 'Felix', 'Ines', 'Kai']);
  return (
    <Frame>
      <Row label="selectable (aria-pressed)">
        {names.map((name) => (
          <Chip
            key={name}
            label={name}
            selected={selected[name] ?? false}
            onToggle={() => setSelected((prev) => ({ ...prev, [name]: !prev[name] }))}
          />
        ))}
        <Chip label="Disabled" disabled onToggle={() => {}} />
      </Row>
      <Row label="selectable + removable">
        {names.map((name) => (
          <Chip
            key={name}
            label={name}
            leadingIcon={<SparklesIcon />}
            selected={selected[name] ?? false}
            onToggle={() => setSelected((prev) => ({ ...prev, [name]: !prev[name] }))}
            onRemove={() => setNames((prev) => prev.filter((n) => n !== name))}
          />
        ))}
      </Row>
      <Row label="removable only">
        <Chip label="Unisex" onRemove={() => {}} />
        <Chip label="Popular 2026" onRemove={() => {}} />
      </Row>
    </Frame>
  );
}

function TabsDemo() {
  return (
    <Tabs defaultValue="popular" className="gap-lg">
      <TabsList aria-label="Name categories">
        <TabsTrigger value="popular">Popular</TabsTrigger>
        <TabsTrigger value="classic">Classic</TabsTrigger>
        <TabsTrigger value="adventurous">Adventurous</TabsTrigger>
      </TabsList>
      <TabsPanel value="popular">
        <p className="text-sm text-ink-secondary">Trending names this week — swipe away.</p>
      </TabsPanel>
      <TabsPanel value="classic">
        <p className="text-sm text-ink-secondary">Timeless picks that never go out of style.</p>
      </TabsPanel>
      <TabsPanel value="adventurous">
        <p className="text-sm text-ink-secondary">Bold names for bold families.</p>
      </TabsPanel>
    </Tabs>
  );
}

function BottomSheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Frame>
      <Row label="bottom sheet (mobile) → modal (≥ 768px)">
        <Button onClick={() => setOpen(true)}>Open sheet</Button>
      </Row>
      <p className="text-sm text-ink-secondary">
        Resize the window: below 768px it slides up from the bottom; at 768px and up it centers as a
        modal. Escape, the scrim, and focus trapping behave identically in both modes.
      </p>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="It's a match!">
        <div className="flex flex-col gap-lg">
          <p className="text-sm text-ink-secondary">
            You and your partner both liked <strong className="text-ink">Ada</strong>. Bring it up
            at dinner?
          </p>
          <div className="flex flex-col gap-sm sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep swiping
            </Button>
            <Button icon={<HeartIcon />} onClick={() => setOpen(false)}>
              Sweet
            </Button>
          </div>
        </div>
      </BottomSheet>
    </Frame>
  );
}

function ScreenHeaderDemo() {
  const [pressed, setPressed] = useState(false);
  return (
    <Frame>
      <div className="overflow-hidden rounded-xl border border-line">
        <ScreenHeader
          title="Swiping session"
          subtitle={pressed ? 'Back was pressed' : 'Ada is next'}
          onBack={() => setPressed((p) => !p)}
          actions={
            <IconButton aria-label="Favorite this session" variant="secondary">
              <HeartIcon />
            </IconButton>
          }
        />
        <div className="p-lg text-sm text-ink-secondary">
          The header sticks to the top while content scrolls beneath it.
        </div>
      </div>
    </Frame>
  );
}

function SpinnerSkeletonDemo() {
  return (
    <Frame>
      <Row label="spinner — sm / md / lg">
        <Spinner size="sm" label="Loading small" />
        <Spinner size="md" label="Loading medium" />
        <Spinner size="lg" label="Loading large" />
        <Button loading>Saving</Button>
      </Row>
      <Row label="skeleton — card placeholder">
        <div className="flex w-full max-w-modal items-center gap-md">
          <Skeleton circle className="h-12 w-12 shrink-0" />
          <div className="flex w-full flex-col gap-sm">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Row>
    </Frame>
  );
}

/* ─────────────────────────── the page ───────────────────────────────── */

export function Styleguide() {
  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-3xl px-lg py-xl md:px-xl">
      <header className="flex flex-col gap-sm">
        <Link
          to="/"
          className="text-sm font-medium text-brand-600 underline underline-offset-4 hover:text-brand-700"
        >
          ← Back to NameSwipe
        </Link>
        <h1 className="text-3xl font-bold text-ink">NameSwipe design system</h1>
        <p className="text-sm text-ink-secondary">
          Every primitive, every variant. Mobile-first: verified at 375px and 1280px.
        </p>
      </header>

      <Section
        id="tokens-color"
        title="Color tokens"
        hint="Warm + friendly; raw values live only in src/index.css."
      >
        {SCALES.map((scale) => (
          <div key={scale.name} className="flex flex-col gap-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {scale.name}
            </span>
            <div className="grid grid-cols-4 gap-sm sm:grid-cols-5 md:grid-cols-10">
              {scale.steps.map((step) => (
                <Swatch key={step} token={`--color-${scale.name}-${step}`} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            semantic
          </span>
          <div className="grid grid-cols-4 gap-sm sm:grid-cols-6 md:grid-cols-11">
            {SEMANTIC_COLORS.map((token) => (
              <Swatch key={token} token={token} />
            ))}
          </div>
        </div>
      </Section>

      <Section id="tokens-type" title="Type scale">
        <Frame>
          {TYPE_SCALE.map((size) => (
            <div key={size} className="flex items-baseline gap-lg">
              <code className="w-10 shrink-0 text-xs text-ink-muted">{size}</code>
              <span
                className="font-semibold text-ink"
                style={{
                  fontSize: `var(--text-${size})`,
                  lineHeight: `var(--text-${size}--line-height)`,
                }}
              >
                A lovely name for a little one
              </span>
            </div>
          ))}
        </Frame>
      </Section>

      <Section id="tokens-space" title="Spacing, radius & shadows">
        <Frame>
          <Row label="spacing">
            {SPACINGS.map((step) => (
              <div key={step} className="flex flex-col items-center gap-xs">
                <div
                  className="h-4 rounded-sm bg-brand-400"
                  style={{ width: `var(--spacing-${step})` }}
                />
                <code className="text-xs text-ink-muted">{step}</code>
              </div>
            ))}
          </Row>
          <Row label="radius">
            {RADII.map((step) => (
              <div key={step} className="flex flex-col items-center gap-xs">
                <div
                  className="h-12 w-16 bg-accent-300"
                  style={{ borderRadius: `var(--radius-${step})` }}
                />
                <code className="text-xs text-ink-muted">{step}</code>
              </div>
            ))}
          </Row>
          <Row label="shadows">
            {SHADOWS.map((step) => (
              <div key={step} className="flex flex-col items-center gap-xs">
                <div
                  className="h-12 w-16 rounded-lg bg-surface-raised"
                  style={{ boxShadow: `var(--shadow-${step})` }}
                />
                <code className="text-xs text-ink-muted">{step}</code>
              </div>
            ))}
          </Row>
        </Frame>
      </Section>

      <Section
        id="button"
        title="Button"
        hint="primary / secondary / ghost / danger × sm / md / lg — loading, disabled, icon slot."
      >
        <ButtonsDemo />
      </Section>

      <Section id="icon-button" title="IconButton" hint="Icon-only; accessible name is mandatory.">
        <IconButtonsDemo />
      </Section>

      <Section id="chip" title="Chip" hint="Selectable (aria-pressed), removable, or both.">
        <ChipsDemo />
      </Section>

      <Section
        id="tabs"
        title="Tabs"
        hint="Roving tabindex + arrow-key navigation (WAI-ARIA tabs pattern)."
      >
        <TabsDemo />
      </Section>

      <Section
        id="bottom-sheet"
        title="BottomSheet"
        hint="Sheet under 768px, centered modal at ≥ 768px; focus trap, Escape, scroll lock."
      >
        <BottomSheetDemo />
      </Section>

      <Section id="empty-state" title="EmptyState">
        <Frame>
          <EmptyState
            icon={<HeartIcon className="h-icon-lg w-icon-lg" />}
            title="No matches yet"
            body="Keep swiping — when you both like the same name, it lands here."
            action={<Button variant="secondary">Start swiping</Button>}
          />
        </Frame>
      </Section>

      <Section id="screen-header" title="ScreenHeader">
        <ScreenHeaderDemo />
      </Section>

      <Section id="spinner-skeleton" title="Spinner & Skeleton">
        <SpinnerSkeletonDemo />
      </Section>
    </div>
  );
}
