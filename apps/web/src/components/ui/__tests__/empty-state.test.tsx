import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from '../EmptyState';
import { Button, HeartIcon } from '../index';

describe('EmptyState', () => {
  it('renders title, body and action slot', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No matches yet"
        body="Keep swiping — you'll get there."
        action={<Button onClick={onClick}>Start swiping</Button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'No matches yet' })).toBeInTheDocument();
    expect(screen.getByText(/keep swiping/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start swiping' })).toBeInTheDocument();
  });

  it('renders a decorative icon bubble when an icon is provided', () => {
    render(<EmptyState icon={<HeartIcon />} title="Nothing here" />);
    expect(screen.getByTestId('icon-heart')).toBeInTheDocument();
  });

  it('omits icon, body and action when not provided', () => {
    render(<EmptyState title="Just a title" />);
    expect(screen.queryByTestId('icon-heart')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Just a title' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('supports a custom heading level', () => {
    render(<EmptyState as="h2" title="Section-level empty" />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Section-level empty' }),
    ).toBeInTheDocument();
  });

  it('fires the action', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<EmptyState title="Empty" action={<Button onClick={onClick}>Retry</Button>} />);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
