import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs, TabsList, TabsPanel, TabsTrigger } from '../Tabs';

function DemoTabs(props?: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
}) {
  const controlled = props?.value !== undefined || props?.onValueChange !== undefined;
  const [internal, setInternal] = useState(props?.defaultValue ?? 'a');
  const value = props?.value ?? internal;
  const setValue = (next: string) => {
    setInternal(next);
    props?.onValueChange?.(next);
  };
  return (
    <Tabs
      value={controlled ? value : undefined}
      defaultValue={controlled ? undefined : value}
      onValueChange={controlled ? setValue : undefined}
    >
      <TabsList aria-label="Demo tabs">
        <TabsTrigger value="a">Alpha</TabsTrigger>
        <TabsTrigger value="b">Beta</TabsTrigger>
        <TabsTrigger value="c" disabled>
          Gamma
        </TabsTrigger>
      </TabsList>
      <TabsPanel value="a">Panel A</TabsPanel>
      <TabsPanel value="b">Panel B</TabsPanel>
      <TabsPanel value="c">Panel C</TabsPanel>
    </Tabs>
  );
}

const getTabs = () => screen.getAllByRole('tab');

describe('Tabs', () => {
  it('renders a labelled tablist with tab and tabpanel roles', () => {
    render(<DemoTabs />);
    expect(screen.getByRole('tablist', { name: 'Demo tabs' })).toBeInTheDocument();
    expect(getTabs()).toHaveLength(3);
    // inactive panels stay mounted but hidden (hidden: true reaches them)
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(3);
  });

  it('marks the active tab selected and panels are wired by id', () => {
    render(<DemoTabs defaultValue="b" />);
    const [a, b, c] = getTabs();
    expect(a).toHaveAttribute('aria-selected', 'false');
    expect(b).toHaveAttribute('aria-selected', 'true');
    expect(c).toHaveAttribute('aria-selected', 'false');

    const panelB = screen.getByRole('tabpanel', { name: 'Beta' });
    expect(panelB).toHaveAttribute('aria-labelledby', b.id);
    expect(b).toHaveAttribute('aria-controls', panelB.id);
  });

  it('uses a roving tabindex: only the selected tab is tabbable', () => {
    render(<DemoTabs defaultValue="b" />);
    const [a, b, c] = getTabs();
    expect(a).toHaveAttribute('tabindex', '-1');
    expect(b).toHaveAttribute('tabindex', '0');
    expect(c).toHaveAttribute('tabindex', '-1');
  });

  it('shows only the selected panel', () => {
    render(<DemoTabs defaultValue="a" />);
    expect(screen.getByText('Panel A')).toBeVisible();
    expect(screen.getByText('Panel B')).not.toBeVisible();
    expect(screen.getByText('Panel C')).not.toBeVisible();
  });

  it('activates a tab on click', async () => {
    const user = userEvent.setup();
    render(<DemoTabs />);
    await user.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Panel B')).toBeVisible();
  });

  describe('keyboard navigation', () => {
    it('ArrowRight moves selection and focus, skipping disabled tabs', () => {
      render(<DemoTabs defaultValue="a" />);
      const [a, b, c] = getTabs();
      a.focus();
      expect(a).toHaveFocus();

      fireEvent.keyDown(a, { key: 'ArrowRight' });
      expect(b).toHaveFocus();
      expect(b).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(b, { key: 'ArrowRight' });
      // skips disabled Gamma, wraps to Alpha
      expect(a).toHaveFocus();
      expect(a).toHaveAttribute('aria-selected', 'true');
      expect(c).toHaveAttribute('aria-selected', 'false');
    });

    it('ArrowLeft wraps backwards', () => {
      render(<DemoTabs defaultValue="a" />);
      const [a, , c] = getTabs();
      a.focus();
      fireEvent.keyDown(a, { key: 'ArrowLeft' });
      // backwards from Alpha wraps to the last enabled tab (Gamma is disabled → Beta)
      expect(screen.getByRole('tab', { name: 'Beta' })).toHaveFocus();
      expect(c).toHaveAttribute('aria-selected', 'false');
    });

    it('Home and End jump to first/last enabled tabs', () => {
      render(<DemoTabs defaultValue="b" />);
      const [a, b] = getTabs();
      b.focus();
      fireEvent.keyDown(b, { key: 'Home' });
      expect(a).toHaveFocus();
      expect(a).toHaveAttribute('aria-selected', 'true');
      fireEvent.keyDown(a, { key: 'End' });
      expect(screen.getByRole('tab', { name: 'Beta' })).toHaveFocus();
    });

    it('shows the panel for the keyboard-activated tab', () => {
      render(<DemoTabs />);
      const [a] = getTabs();
      a.focus();
      fireEvent.keyDown(a, { key: 'ArrowRight' });
      expect(screen.getByText('Panel B')).toBeVisible();
      expect(screen.getByText('Panel A')).not.toBeVisible();
    });
  });

  it('supports controlled usage via onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Tabs value="a" onValueChange={onValueChange}>
        <TabsList aria-label="Controlled">
          <TabsTrigger value="a">Alpha</TabsTrigger>
          <TabsTrigger value="b">Beta</TabsTrigger>
        </TabsList>
        <TabsPanel value="a">Panel A</TabsPanel>
        <TabsPanel value="b">Panel B</TabsPanel>
      </Tabs>,
    );
    await user.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
    // stays controlled: parent did not change value
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
  });

  it('marks disabled triggers aria-disabled and inert', () => {
    render(<DemoTabs />);
    const gamma = screen.getByRole('tab', { name: 'Gamma' });
    expect(gamma).toHaveAttribute('aria-disabled', 'true');
    expect(gamma).toBeDisabled();
  });
});
