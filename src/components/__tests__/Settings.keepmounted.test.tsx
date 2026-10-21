// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Settings from '../Settings';
import type { SettingsSection } from '../../types';

// Stand-ins holding uncontrolled input: a remount would reset their value.
vi.mock('../api/ApiManager', () => ({ default: () => <input aria-label="api draft" /> }));
vi.mock('../settings/BackupSection', () => ({
  default: () => <input aria-label="backup draft" />,
}));

afterEach(cleanup);

function renderAt(section: SettingsSection) {
  const props = { layout: 'grid' as const, onLayoutChange: vi.fn(), onSettingsSection: vi.fn() };
  const view = render(<Settings activeSection={section} {...props} />);
  return (next: SettingsSection) => view.rerender(<Settings activeSection={next} {...props} />);
}

describe('Settings section switching', () => {
  it.each([
    ['api', 'api draft'],
    ['backup', 'backup draft'],
  ] as const)('keeps unsaved %s input across a section switch', (section, label) => {
    const show = renderAt(section);
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'typed' } });

    show('general');
    expect(screen.getByLabelText(label).closest('[hidden]')).not.toBeNull();

    show(section);
    expect(screen.getByLabelText(label)).toHaveProperty('value', 'typed');
  });

  it('does not mount a kept section before it is opened', () => {
    renderAt('general');
    expect(screen.queryByLabelText('api draft')).toBeNull();
    expect(screen.queryByLabelText('backup draft')).toBeNull();
  });
});
