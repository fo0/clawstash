// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StashViewer from '../StashViewer';
import type { Stash, StashFile } from '../../types';

// jsdom has no layout engine, so neither `scrollIntoView` nor `matchMedia`
// (read for the reduced-motion scroll behaviour) exists by default.
beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const README = [
  '# Guide',
  '',
  'Intro.',
  '',
  '## Install',
  '',
  'Steps.',
  '',
  '## Usage',
  '',
  'Run it.',
].join('\n');

function file(n: number, filename: string, content: string, language: string): StashFile {
  return { id: `f${n}`, stash_id: 'abc', filename, content, language, sort_order: n };
}

function stashWith(files: StashFile[]): Stash {
  return {
    id: 'abc',
    name: 'My stash',
    description: '',
    tags: [],
    metadata: {},
    version: 1,
    archived: false,
    backup_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    files,
  };
}

function renderViewer(files: StashFile[]) {
  return render(
    <StashViewer
      stash={stashWith(files)}
      onEdit={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onArchive={vi.fn()}
      onBack={vi.fn()}
      onAnalyzeStash={vi.fn()}
      onFilterTag={vi.fn()}
      isFavorite={false}
      onToggleFavorite={vi.fn()}
    />,
  );
}

function tocHeadingHrefs(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Table of contents' });
  return Array.from(nav.querySelectorAll('.toc-heading a')).map(
    (a) => a.getAttribute('href') ?? '',
  );
}

describe('StashViewer table of contents for a single markdown file', () => {
  it('lists the headings of a lone markdown file once it has enough of them', () => {
    renderViewer([file(0, 'README.md', README, 'markdown')]);

    // The file keeps its unprefixed heading ids, so links already shared to
    // one of its sections keep resolving.
    expect(tocHeadingHrefs()).toEqual(['#guide', '#install', '#usage']);
  });

  it('stays away from a short file with fewer headings than the threshold', () => {
    renderViewer([file(0, 'NOTE.md', '# Note\n\nBody.\n\n## Detail\n\nMore.', 'markdown')]);

    expect(screen.queryByRole('button', { name: /Table of Contents/ })).toBeNull();
  });

  it('does not count heading tags written inside a code block', () => {
    const content = [
      '# Page',
      '',
      '## Markup',
      '',
      '```html',
      '<h1>a</h1>',
      '<h2>b</h2>',
      '```',
    ].join('\n');
    renderViewer([file(0, 'PAGE.md', content, 'markdown')]);

    expect(screen.queryByRole('button', { name: /Table of Contents/ })).toBeNull();
  });

  it('counts only markdown files — a README next to code still gets one', () => {
    renderViewer([
      file(0, 'README.md', README, 'markdown'),
      file(1, 'deploy.sh', 'echo hi', 'bash'),
    ]);

    expect(tocHeadingHrefs()).toEqual(['#guide', '#install', '#usage']);
  });

  it('expands the collapsed file before jumping to one of its headings', () => {
    const { container } = renderViewer([
      file(0, 'README.md', README, 'markdown'),
      file(1, 'deploy.sh', 'echo hi', 'bash'),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse README.md' }));
    expect(container.querySelector('#install')).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Install' }));

    expect(screen.getByRole('button', { name: 'Collapse README.md' })).toBeTruthy();
    expect(container.querySelector('#install')).toBeTruthy();
  });

  it('keeps the per-file prefix once two markdown files share the stash', () => {
    renderViewer([
      file(0, 'README.md', README, 'markdown'),
      file(1, 'CHANGES.md', '# Changes', 'markdown'),
    ]);

    expect(tocHeadingHrefs()).toEqual(['#f0-guide', '#f0-install', '#f0-usage', '#f1-changes']);
  });
});
