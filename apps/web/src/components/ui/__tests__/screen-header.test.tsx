import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScreenHeader } from '../ScreenHeader';
import { HeartIcon, IconButton } from '../index';

describe('ScreenHeader', () => {
  it('renders title and subtitle as h1 + supporting text', () => {
    render(<ScreenHeader title="Swiping session" subtitle="Ada is next" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Swiping session' })).toBeInTheDocument();
    expect(screen.getByText('Ada is next')).toBeInTheDocument();
  });

  it('omits the back button and subtitle when not provided', () => {
    render(<ScreenHeader title="Solo" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Ada is next')).not.toBeInTheDocument();
  });

  it('renders a labelled back button that fires onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<ScreenHeader title="Somewhere" onBack={onBack} />);
    const back = screen.getByRole('button', { name: 'Back' });
    await user.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('honors a custom backLabel', () => {
    render(<ScreenHeader title="Somewhere" onBack={() => {}} backLabel="Return to names" />);
    expect(screen.getByRole('button', { name: 'Return to names' })).toBeInTheDocument();
  });

  it('renders an actions slot on the end', () => {
    render(
      <ScreenHeader
        title="Somewhere"
        actions={
          <IconButton aria-label="Favorite">
            <HeartIcon />
          </IconButton>
        }
      />,
    );
    expect(screen.getByRole('button', { name: 'Favorite' })).toBeInTheDocument();
  });
});
