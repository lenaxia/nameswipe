import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, type ButtonVariant } from '../Button';
import { HeartIcon } from '../icons';

const VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;
const VARIANT_TOKEN_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500',
  secondary: 'bg-surface-raised',
  ghost: 'text-brand-600',
  danger: 'bg-danger-500',
};

describe('Button', () => {
  it.each(VARIANTS)('renders the %s variant', (variant) => {
    render(<Button variant={variant}>Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveAttribute('data-variant', variant);
    expect(button.className).toContain(VARIANT_TOKEN_CLASS[variant]);
    expect(button).toHaveAttribute('type', 'button');
  });

  it.each(['sm', 'md', 'lg'] as const)('renders the %s size', (size) => {
    render(<Button size={size}>Go</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-size', size);
    expect(button.className).toContain(`h-control-${size}`);
  });

  it('defaults to primary/md', () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'md');
  });

  it('fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('blocks clicks and sets disabled when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  describe('loading', () => {
    it('sets aria-busy, disables, shows spinner with sr-only label', () => {
      render(<Button loading>Saving</Button>);
      const button = screen.getByRole('button', { name: /saving/i });
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toHaveAttribute('data-loading', 'true');
      expect(button).toBeDisabled();
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });

    it('blocks clicks while loading', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          Saving
        </Button>,
      );
      await user.click(screen.getByRole('button', { name: /saving/i }));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('honors a custom loadingLabel', () => {
      render(
        <Button loading loadingLabel="Sending hugs">
          Saving
        </Button>,
      );
      expect(screen.getByRole('status')).toHaveTextContent('Sending hugs');
    });

    it('loses busy state once loading clears', () => {
      const { rerender } = render(<Button loading>Saving</Button>);
      rerender(<Button loading={false}>Saving</Button>);
      const button = screen.getByRole('button', { name: 'Saving' });
      expect(button).not.toHaveAttribute('aria-busy');
      expect(button).not.toBeDisabled();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('renders a leading icon in a decorative wrapper', () => {
    render(<Button icon={<HeartIcon />}>Match</Button>);
    const button = screen.getByRole('button', { name: 'Match' });
    expect(button.querySelector('[data-testid="icon-heart"]')).toBeInTheDocument();
    const wrapper = button.querySelector('[aria-hidden="true"]');
    expect(wrapper).toContainElement(screen.getByTestId('icon-heart'));
  });
});
