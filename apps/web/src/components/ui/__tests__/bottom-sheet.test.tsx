import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from '../BottomSheet';
import { createMatchMediaStub } from '../../../test/match-media';

const DESKTOP_QUERY = '(min-width: 48rem)';

function SheetHarness(props?: { title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={props?.title ?? "It's a match!"}
      >
        <button>First action</button>
        <button>Second action</button>
      </BottomSheet>
    </div>
  );
}

const openSheet = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open' }));
  return screen.getByRole('dialog');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BottomSheet', () => {
  it('renders nothing while closed', () => {
    render(
      <BottomSheet open={false} onClose={() => {}}>
        content
      </BottomSheet>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  describe('mobile sheet (< 768px)', () => {
    it('anchors to the bottom as a sheet', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(false));
      render(<SheetHarness />);
      const dialog = await openSheet();
      expect(dialog).toHaveAttribute('data-mode', 'sheet');
      expect(dialog.className).toContain('rounded-t-2xl');
      expect(dialog.className).not.toContain('max-w-modal');
      expect(screen.getByTestId('bottom-sheet-handle')).toBeInTheDocument();
    });
  });

  describe('desktop modal (≥ 768px)', () => {
    it('centers as a modal with a max width', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(true));
      render(<SheetHarness />);
      const dialog = await openSheet();
      expect(dialog).toHaveAttribute('data-mode', 'modal');
      expect(dialog.className).toContain('max-w-modal');
      expect(dialog.className).toContain('rounded-2xl');
      expect(screen.queryByTestId('bottom-sheet-handle')).not.toBeInTheDocument();
    });

    it('supports Escape close in modal mode too', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(true));
      render(<SheetHarness />);
      await openSheet();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  it('switches presentation live when the viewport crosses 768px', async () => {
    const stub = createMatchMediaStub(false);
    vi.stubGlobal('matchMedia', stub);
    render(<SheetHarness />);
    const dialog = await openSheet();
    expect(dialog).toHaveAttribute('data-mode', 'sheet');
    stub.setMatches(DESKTOP_QUERY, true);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('data-mode', 'modal'));
  });

  describe('dialog semantics', () => {
    it('is an aria-modal dialog labelled by its title', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(false));
      render(<SheetHarness title="Pair with partner" />);
      const dialog = await openSheet();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      const title = screen.getByRole('heading', { name: 'Pair with partner' });
      expect(dialog).toHaveAttribute('aria-labelledby', title.id);
    });

    it('falls back to aria-label without a title', () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(false));
      render(
        <BottomSheet open onClose={() => {}} aria-label="Quick actions">
          body
        </BottomSheet>,
      );
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Quick actions');
    });
  });

  describe('closing', () => {
    it('closes on Escape', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(false));
      render(<SheetHarness />);
      await openSheet();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('closes when the scrim is clicked but not on dialog clicks', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(false));
      const user = userEvent.setup();
      render(<SheetHarness />);
      await openSheet();
      await user.click(screen.getByRole('button', { name: 'First action' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('bottom-sheet-overlay'));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('body scroll lock', () => {
    it('locks scroll while open and restores it on close', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(false));
      const user = userEvent.setup();
      render(<SheetHarness />);
      await openSheet();
      expect(document.body.style.overflow).toBe('hidden');
      fireEvent.keyDown(document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(document.body.style.overflow).toBe('');
      await user.click(screen.getByRole('button', { name: 'Open' })); // sanity: openable again
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('restores scroll state if unmounted while open', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(false));
      const { unmount } = render(
        <BottomSheet open onClose={() => {}}>
          body
        </BottomSheet>,
      );
      expect(document.body.style.overflow).toBe('hidden');
      unmount();
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('focus management', () => {
    it('moves focus to the first focusable element on open', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(false));
      render(<SheetHarness />);
      await openSheet();
      expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();
    });

    it('traps Tab inside the dialog (wraps at both ends)', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(false));
      render(<SheetHarness />);
      const dialog = await openSheet();
      const first = screen.getByRole('button', { name: 'First action' });
      const last = screen.getByRole('button', { name: 'Second action' });
      expect(first).toHaveFocus();

      // Shift+Tab on the first element wraps forward to the last
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(last).toHaveFocus();

      // Tab on the last element wraps back to the first
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(first).toHaveFocus();
    });

    it('returns focus to the opener on close', async () => {
      vi.stubGlobal('matchMedia', createMatchMediaStub(false));
      render(<SheetHarness />);
      const opener = screen.getByRole('button', { name: 'Open' });
      await openSheet();
      expect(opener).not.toHaveFocus();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(opener).toHaveFocus();
    });
  });
});
