import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from '../Skeleton';

describe('Skeleton', () => {
  it('renders a decorative pulsing block', () => {
    render(<Skeleton data-testid="sk" />);
    const skeleton = screen.getByTestId('sk');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton.className).toContain('animate-pulse');
    expect(skeleton.className).toContain('bg-surface-sunken');
    expect(skeleton.className).toContain('rounded-md');
  });

  it('renders as a circle when circle is set', () => {
    render(<Skeleton circle data-testid="sk" />);
    const skeleton = screen.getByTestId('sk');
    expect(skeleton).toHaveAttribute('data-circle', 'true');
    expect(skeleton.className).toContain('rounded-full');
  });

  it('accepts sizing classes from the spacing scale', () => {
    render(<Skeleton className="h-4 w-3/4" data-testid="sk" />);
    expect(screen.getByTestId('sk').className).toContain('h-4');
    expect(screen.getByTestId('sk').className).toContain('w-3/4');
  });

  it('is hidden from the accessibility tree', () => {
    render(<Skeleton />);
    expect(document.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
