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
    // Type-checking happens separately via `npx tsc --noEmit` to keep the
    // test runner fast.
    typecheck: { enabled: false },
  },
});
