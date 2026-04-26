import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Type-checking happens separately via `npx tsc --noEmit` to keep the
    // test runner fast.
    typecheck: { enabled: false },
  },
});
