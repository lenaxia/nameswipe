import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Chip } from '../Chip';
import { SparklesIcon } from '../icons';

describe('Chip', () => {
  it('renders its label', () => {
    render(<Chip label="Ada" />);
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  describe('selectable', () => {
    it('exposes aria-pressed and toggles on click', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      render(<Chip label="Ada" onToggle={onToggle} />);
      const chip = screen.getByRole('button', { name: 'Ada' });
      expect(chip).toHaveAttribute('aria-pressed', 'false');
      await user.click(chip);
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it('reflects the selected state', () => {
      render(<Chip label="Ada" selected onToggle={() => {}} />);
      const chip = screen.getByRole('button', { name: 'Ada' });
      expect(chip).toHaveAttribute('aria-pressed', 'true');
      expect(chip.closest('span')).toHaveAttribute('data-selected', 'true');
    });

    it('renders a leading icon', () => {
      render(<Chip label="Ada" onToggle={() => {}} leadingIcon={<SparklesIcon />} />);
      expect(screen.getByTestId('icon-sparkles')).toBeInTheDocument();
    });
  });

  describe('removable', () => {
    it('renders a labeled remove button and fires onRemove', async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      render(<Chip label="Ada" onRemove={onRemove} />);
      const remove = screen.getByRole('button', { name: 'Remove Ada' });
      await user.click(remove);
      expect(onRemove).toHaveBeenCalledOnce();
    });

    it('names the remove button generically for non-string labels', () => {
      render(<Chip label={<em>Ada</em>} onRemove={() => {}} />);
      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });
  });

  describe('selectable + removable', () => {
    it('offers both controls independently', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      const onRemove = vi.fn();
      render(<Chip label="Ada" onToggle={onToggle} onRemove={onRemove} />);
      await user.click(screen.getByRole('button', { name: 'Ada' }));
      await user.click(screen.getByRole('button', { name: 'Remove Ada' }));
      expect(onToggle).toHaveBeenCalledOnce();
      expect(onRemove).toHaveBeenCalledOnce();
    });
  });

  it('ignores interaction while disabled', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onRemove = vi.fn();
    render(<Chip label="Ada" onToggle={onToggle} onRemove={onRemove} disabled />);
    expect(screen.getByRole('button', { name: 'Ada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Ada' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Ada' }));
    await user.click(screen.getByRole('button', { name: 'Remove Ada' }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText('Ada').closest('span')).toHaveAttribute('data-disabled', 'true');
  });
});
