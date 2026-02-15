import type { Metadata } from 'next';
import '../styles/app.css';

export const metadata: Metadata = {
  title: 'ClawStash - AI Stash Storage',
  description: 'AI-optimized code & data vault',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🗄️</text></svg>",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
