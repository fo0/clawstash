import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * ESLint 9 flat config for ClawStash.
 *
 * Deliberately a *correctness* linter, not a style one: Prettier owns
 * formatting (`npm run format:check`), so no formatting rule lives here and
 * nothing in this config may conflict with it.
 *
 * The set is the typescript-eslint recommended baseline plus the type-aware
 * and React-hook rules that catch the bug classes earlier sweeps had to find
 * by hand (unawaited promises on the server, promise-returning callbacks in
 * void positions, dead conditions, stale effect dependencies). Rules that are
 * pure noise against this codebase are switched off *explicitly and with a
 * reason* — see the comments below and the ESLint note in CLAUDE.md.
 */
export default tseslint.config(
  {
    // `.claude/` is tool-managed and excluded from Prettier as well — keep
    // both ignore lists in sync.
    ignores: [
      '.next/**',
      '.claude/**',
      'coverage/**',
      'dist/**',
      'build/**',
      'out/**',
      'public/**',
      'next-env.d.ts',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  // --- Application + server code: type-aware rules -------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // A promise-returning function handed to something that ignores the
      // return value (e.g. an `onChange` typed `() => void` in a non-JSX
      // position) swallows rejections — that is a real bug class.
      // `attributes: false` exempts JSX props: `onClick={async () => …}` is
      // the idiomatic React spelling and React handles it.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
      // Re-enabled below for server + API code only; inside the React tree a
      // "floating" promise is the standard fire-and-forget handler call.
      '@typescript-eslint/no-floating-promises': 'off',
      // React correctness: hook order and stale closures in effects.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Unused values are errors, with the conventional `_` opt-out.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // --- Deliberately off (documented narrowing, not "make it green") ---
      // better-sqlite3 returns `unknown`/`any` rows that every store casts
      // with `as`; the unsafe-* family would fire on hundreds of intentional
      // call sites and drown the signal.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      // The MCP SDK types every tool handler as returning a promise, so ~50
      // handlers are `async` without awaiting anything. Stylistic here.
      '@typescript-eslint/require-await': 'off',
      // Auto-fixable but purely cosmetic; would mean touching a dozen
      // unrelated files. Tracked as a follow-up instead.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },

  // --- Server + API routes: unawaited promises are real defects here -------
  {
    files: ['src/server/**/*.ts', 'src/app/api/**/*.ts'],
    rules: {
      // Only enforced outside the React tree: in components a floating
      // promise is usually a fire-and-forget event handler, on the server it
      // is a lost write or an unhandled rejection.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  // --- Tests: vitest mock idioms trip type-aware rules ---------------------
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    rules: {
      // `expect(mock.method)` / `vi.spyOn(obj, 'm')` pass methods around
      // unbound on purpose.
      '@typescript-eslint/unbound-method': 'off',
      // Assertions stringify fixture objects on purpose.
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },

  // --- Tooling / config files: no type information available ---------------
  {
    files: [
      '*.{js,mjs,cjs,ts}',
      'scripts/**/*.{js,mjs,cjs}',
      'eslint.config.js',
      'next.config.ts',
      'vitest.config.ts',
    ],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },
);
