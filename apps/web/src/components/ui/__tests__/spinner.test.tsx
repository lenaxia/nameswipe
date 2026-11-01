import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('announces itself as a status with a visually hidden label', () => {
    render(<Spinner />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading…');
    expect(status.querySelector('.sr-only')).toHaveTextContent('Loading…');
  });

  it.each(['sm', 'md', 'lg'] as const)('renders the %s size', (size) => {
    const { rerender } = render(<span />);
    rerender(<Spinner size={size} label={`Loading ${size}`} />);
    expect(screen.getByRole('status')).toHaveAttribute('data-size', size);
    expect(screen.getByRole('status')).toHaveTextContent(`Loading ${size}`);
  });

  it('animates and is decorative as an svg', () => {
    render(<Spinner />);
    const svg = screen.getByTestId('spinner');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.getAttribute('class')).toContain('animate-spin');
  });

  it('accepts a custom label', () => {
    render(<Spinner label="Fetching names" />);
    expect(screen.getByRole('status')).toHaveTextContent('Fetching names');
  });
});
