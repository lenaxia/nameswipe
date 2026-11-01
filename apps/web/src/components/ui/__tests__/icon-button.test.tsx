import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from '../IconButton';
import { HeartIcon } from '../icons';

describe('IconButton', () => {
  it('exposes its accessible name and hides the decorative icon', () => {
    render(
      <IconButton aria-label="Love this name">
        <HeartIcon />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Love this name' });
    expect(button).toBeInTheDocument();
    expect(button.querySelector('[data-testid="icon-heart"]')).toBeInTheDocument();
    expect(button.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'renders the %s variant',
    (variant) => {
      render(
        <IconButton variant={variant} aria-label={`${variant} action`}>
          <HeartIcon />
        </IconButton>,
      );
      expect(screen.getByRole('button')).toHaveAttribute('data-variant', variant);
    },
  );

  it.each(['sm', 'md', 'lg'] as const)('renders the %s size', (size) => {
    render(
      <IconButton size={size} aria-label={`${size} action`}>
        <HeartIcon />
      </IconButton>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-size', size);
    expect(button.className).toContain(`h-control-${size}`);
    expect(button.className).toContain(`w-control-${size}`);
  });

  it('fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Love" onClick={onClick}>
        <HeartIcon />
      </IconButton>,
    );
    await user.click(screen.getByRole('button', { name: 'Love' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Love" onClick={onClick} disabled>
        <HeartIcon />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Love' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a spinner with aria-busy while loading', () => {
    render(
      <IconButton aria-label="Love" loading loadingLabel="Liking">
        <HeartIcon />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Love' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Liking');
  });

  it('forwards the ref to the button element', () => {
    const ref = { current: null };
    render(
      <IconButton ref={ref} aria-label="Love">
        <HeartIcon />
      </IconButton>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
