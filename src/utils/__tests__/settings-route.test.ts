import { describe, it, expect } from 'vitest';
import type { SettingsSection } from '../../types';
import { parseSettingsPath, settingsPath } from '../settings-route';

describe('settingsPath', () => {
  it('keeps Welcome on the bare /settings path', () => {
    expect(settingsPath('welcome')).toBe('/settings');
  });

  it('puts every other section in its own segment', () => {
    expect(settingsPath('api')).toBe('/settings/api');
    expect(settingsPath('backup')).toBe('/settings/backup');
  });
});

describe('parseSettingsPath', () => {
  it('round-trips every section', () => {
    const sections: SettingsSection[] = ['welcome', 'general', 'api', 'backup', 'storage', 'about'];
    for (const section of sections) {
      expect(parseSettingsPath(settingsPath(section))).toBe(section);
    }
  });

  it('rejects unknown sections and non-Settings paths', () => {
    expect(parseSettingsPath('/settings/bogus')).toBeNull();
    expect(parseSettingsPath('/settings/api/extra')).toBeNull();
    expect(parseSettingsPath('/settings/')).toBeNull();
    expect(parseSettingsPath('/')).toBeNull();
    expect(parseSettingsPath('/graph')).toBeNull();
  });
});
