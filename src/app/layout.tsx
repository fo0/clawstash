import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '../styles/app.css';

// Do NOT set `maximumScale` or `userScalable: false` — disabling pinch-zoom
// fails WCAG 1.4.4 (Resize text) and harms low-vision users on mobile. The
// layout is responsive, so the previous "lock" was cosmetic.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'ClawStash - AI Stash Storage',
  description: 'AI-optimized code & data vault',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🗄️</text></svg>",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
