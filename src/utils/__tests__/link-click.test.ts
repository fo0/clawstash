import { describe, expect, it } from 'vitest';
import { isModifiedClick } from '../link-click';

describe('isModifiedClick', () => {
  it('treats a plain primary click as in-app navigation', () => {
    expect(isModifiedClick({ button: 0 })).toBe(false);
    expect(isModifiedClick({})).toBe(false);
  });

  it('leaves modified clicks to the browser', () => {
    expect(isModifiedClick({ button: 0, ctrlKey: true })).toBe(true);
    expect(isModifiedClick({ button: 0, metaKey: true })).toBe(true);
    expect(isModifiedClick({ button: 0, shiftKey: true })).toBe(true);
    expect(isModifiedClick({ button: 0, altKey: true })).toBe(true);
  });

  it('leaves non-primary buttons (middle-click) to the browser', () => {
    expect(isModifiedClick({ button: 1 })).toBe(true);
    expect(isModifiedClick({ button: 2 })).toBe(true);
  });
});
