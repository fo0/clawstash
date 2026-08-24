// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  loadSidebarWidth,
  saveSidebarWidth,
} from '../sidebar-width';

beforeEach(() => {
  localStorage.clear();
});

describe('clampSidebarWidth', () => {
  it('holds the width inside the supported range and rounds to a pixel', () => {
    expect(clampSidebarWidth(320.4)).toBe(320);
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it('falls back to the default rather than collapsing on a non-number', () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(SIDEBAR_DEFAULT_WIDTH);
  });
});

describe('loadSidebarWidth / saveSidebarWidth', () => {
  it('round-trips a stored width', () => {
    saveSidebarWidth(340);
    expect(loadSidebarWidth()).toBe(340);
  });

  it('clamps on the way in as well as on the way out', () => {
    saveSidebarWidth(9999);
    expect(loadSidebarWidth()).toBe(SIDEBAR_MAX_WIDTH);
    localStorage.setItem('clawstash-sidebar-width', '1');
    expect(loadSidebarWidth()).toBe(SIDEBAR_MIN_WIDTH);
  });

  it('returns the default for a missing or hand-edited value', () => {
    expect(loadSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);
    localStorage.setItem('clawstash-sidebar-width', 'wide please');
    expect(loadSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);
  });
});
