// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { containsAppModal, isInsideAppModal } from '../nested-modal';

function fragment(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('containsAppModal', () => {
  it('finds an app-owned match among the descendants', () => {
    const root = fragment('<div><div role="dialog"></div></div>');
    expect(containsAppModal(root, '[role="dialog"]')).toBe(true);
  });

  it('never matches the container itself', () => {
    const root = fragment('');
    root.setAttribute('role', 'dialog');
    expect(containsAppModal(root, '[role="dialog"]')).toBe(false);
  });

  it('skips matches inside rendered Markdown, file body or description', () => {
    const root = fragment(
      '<div class="markdown-body"><p><span aria-modal="true"></span></p></div>' +
        '<div class="markdown-description"><div aria-modal="true"></div></div>',
    );
    expect(containsAppModal(root, '[aria-modal="true"]')).toBe(false);
  });

  it('still finds an app-owned match next to a user-authored one', () => {
    const root = fragment(
      '<div class="markdown-body"><div role="dialog"></div></div><div role="dialog"></div>',
    );
    expect(containsAppModal(root, '[role="dialog"]')).toBe(true);
  });
});

describe('isInsideAppModal', () => {
  it('is true inside an app-owned aria-modal element', () => {
    const root = fragment('<div aria-modal="true"><button></button></div>');
    expect(isInsideAppModal(root.querySelector('button')!)).toBe(true);
  });

  it('is false outside any modal', () => {
    const root = fragment('<button></button>');
    expect(isInsideAppModal(root.querySelector('button')!)).toBe(false);
  });

  it('is false inside an aria-modal that rendered Markdown carries', () => {
    const root = fragment(
      '<div class="markdown-body"><div aria-modal="true"><a href="#x">x</a></div></div>',
    );
    expect(isInsideAppModal(root.querySelector('a')!)).toBe(false);
  });

  it('looks past a user-authored aria-modal to the app modal around it', () => {
    const root = fragment(
      '<div aria-modal="true"><div class="markdown-body"><div aria-modal="true"><a href="#x">x</a></div></div></div>',
    );
    expect(isInsideAppModal(root.querySelector('a')!)).toBe(true);
  });
});
