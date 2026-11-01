import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Styleguide } from '../Styleguide';
import { createMatchMediaStub } from '../../test/match-media';

const SECTION_TITLES = [
  'Color tokens',
  'Type scale',
  'Spacing, radius & shadows',
  'Button',
  'IconButton',
  'Chip',
  'Tabs',
  'BottomSheet',
  'EmptyState',
  'ScreenHeader',
  'Spinner & Skeleton',
];

describe('Styleguide page', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', createMatchMediaStub(false));
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('renders every section of the library', () => {
    render(<Styleguide />);
    for (const title of SECTION_TITLES) {
      expect(
        screen.getByRole('heading', { level: 2, name: title }),
        `section ${title}`,
      ).toBeInTheDocument();
    }
  });

  it('renders every Button variant and size', () => {
    render(<Styleguide />);
    for (const variant of ['primary', 'secondary', 'ghost', 'danger']) {
      expect(
        screen
          .getAllByRole('button', { name: 'Medium' })
          .some((b) => b.dataset.variant === variant),
        variant,
      ).toBe(true);
    }
    for (const size of ['sm', 'md', 'lg']) {
      expect(
        screen
          .getAllByRole('button', { name: /small|medium|large/i })
          .some((b) => b.dataset.size === size),
        size,
      ).toBe(true);
    }
  });

  it('renders every icon button variant', () => {
    render(<Styleguide />);
    for (const variant of ['primary', 'secondary', 'ghost', 'danger']) {
      expect(
        screen.getByRole('button', { name: `${variant} medium action` }),
        variant,
      ).toBeInTheDocument();
    }
  });

  it('sweeps the whole page with zero console errors (incl. interactions)', async () => {
    const user = userEvent.setup();
    render(<Styleguide />);

    // Tabs interaction
    await user.click(screen.getByRole('tab', { name: 'Classic' }));
    expect(screen.getByText(/timeless picks/i)).toBeVisible();

    // Chip interaction
    const chip = screen.getAllByRole('button', { name: 'Felix' })[0];
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    // BottomSheet open → close via its action button
    await user.click(screen.getByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog', { name: "It's a match!" });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // ScreenHeader back interaction
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Back was pressed')).toBeInTheDocument();

    expect(errorSpy, 'console.error must stay silent').not.toHaveBeenCalled();
    expect(warnSpy, 'console.warn must stay silent').not.toHaveBeenCalled();
  });

  it('renders identically clean in desktop (≥768px) mode', async () => {
    vi.stubGlobal('matchMedia', createMatchMediaStub(true));
    const user = userEvent.setup();
    render(<Styleguide />);
    await user.click(screen.getByRole('button', { name: 'Open sheet' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-mode', 'modal');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
