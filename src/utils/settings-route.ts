import type { SettingsSection } from '../types';

const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'welcome',
  'general',
  'api',
  'backup',
  'storage',
  'about',
];

/**
 * URL of a Settings section. Welcome is the bare `/settings` (what opening
 * Settings pushes); every other section is `/settings/<section>`, so a reload
 * restores it and browser-Back steps to the previous section.
 */
export function settingsPath(section: SettingsSection): string {
  return section === 'welcome' ? '/settings' : `/settings/${section}`;
}

/**
 * Section a pathname addresses, or `null` when it is not a Settings URL. An
 * unknown section segment is not a Settings URL either, so it falls through to
 * the dashboard like any other unknown path.
 */
export function parseSettingsPath(path: string): SettingsSection | null {
  if (path === '/settings') return 'welcome';
  const match = path.match(/^\/settings\/([a-z]+)$/);
  if (!match) return null;
  const section = SETTINGS_SECTIONS.find((s) => s === match[1]);
  return section ?? null;
}
