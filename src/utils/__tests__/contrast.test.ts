import { describe, it, expect } from 'vitest';
import { badgeTextColor, relativeLuminance } from '../contrast';

const DARK = 'rgba(13, 17, 23, 0.92)';
const LIGHT = 'rgba(255, 255, 255, 0.9)';

/** Contrast ratio between two relative luminances (WCAG 2.x). */
function ratio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe('relativeLuminance', () => {
  it('spans the full range', () => {
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });
});

describe('badgeTextColor (#142)', () => {
  it('switches to dark text on the light cluster colours', () => {
    // These two were the reported ~1.9:1 offenders with hardcoded white.
    expect(badgeTextColor('#79c0ff')).toBe(DARK);
    expect(badgeTextColor('#ffa657')).toBe(DARK);
  });

  it('keeps white text on the dark cluster colours', () => {
    expect(badgeTextColor('#238636')).toBe(LIGHT);
  });

  it('composites alpha over the canvas background before deciding', () => {
    // A light hue at low alpha is effectively the dark page background.
    expect(badgeTextColor('#79c0ff', 0.2)).toBe(LIGHT);
  });

  it('never picks a text colour below 3:1 on any cluster colour', () => {
    const clusterColors = [
      '#238636',
      '#58a6ff',
      '#d29922',
      '#bc8cff',
      '#f778ba',
      '#3fb950',
      '#79c0ff',
      '#ffa657',
    ];
    for (const hex of clusterColors) {
      for (const alpha of [1, 0.7, 0.2]) {
        const picked = badgeTextColor(hex, alpha);
        const textLum = picked === LIGHT ? 1 : relativeLuminance([13, 17, 23]);
        const rgb = [
          Number.parseInt(hex.slice(1, 3), 16),
          Number.parseInt(hex.slice(3, 5), 16),
          Number.parseInt(hex.slice(5, 7), 16),
        ].map((c, i) => c * alpha + [13, 17, 23][i] * (1 - alpha)) as [number, number, number];
        expect(ratio(textLum, relativeLuminance(rgb))).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
