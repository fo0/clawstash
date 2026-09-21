import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirror the `@/*` -> `./src/*` path alias from tsconfig.json so tests can
  // import modules (e.g. API route helpers) that themselves use `@/`-aliased
  // imports without the runner failing to resolve the package.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Restores jsdom's `localStorage`/`sessionStorage` on `globalThis`, which a
    // Node >= 24 runtime shadows with its own (unconfigured) web storage —
    // see the file for the full story.
    setupFiles: ['./vitest.setup.ts'],
    // Type-checking happens separately via `npx tsc --noEmit` to keep the
    // test runner fast.
    typecheck: { enabled: false },
  },
});
