import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App routing', () => {
  it('renders the NameSwipe heading at /', () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'NameSwipe' })).toBeInTheDocument();
  });

  it('serves the styleguide at /styleguide', () => {
    window.history.pushState({}, '', '/styleguide');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /design system/i })).toBeInTheDocument();
  });
});
