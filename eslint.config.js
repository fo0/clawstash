import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
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

  // --- JSX accessibility ---------------------------------------------------
  // `jsx-a11y` recommended, which is a correctness set (a control with no
  // accessible name, an invalid ARIA prop, a role that cannot carry the props
  // given to it) and contains no formatting rule — so it does not collide with
  // Prettier.
  //
  // What it does NOT cover, so nobody mistakes a green run for a clean audit:
  // the plugin has no `heading-order` rule at all, and there is no
  // `scrollable-region-focusable` either — whether a container actually
  // scrolls depends on CSS and content at runtime, which static analysis
  // cannot see. Both defect classes stay a manual review item.
  //
  // Deliberate patterns the plugin cannot recognise carry a per-site
  // `eslint-disable-next-line` with a reason instead of being switched off
  // here, so a genuinely new violation of those rules is still an error.
  {
    files: ['**/*.{jsx,tsx}'],
    extends: [jsxA11y.flatConfigs.recommended],
    rules: {
      // --- Transitional `warn`, never `off` -------------------------------
      // These three are one cluster: a click handler on a non-interactive
      // element. Clearing them is not mechanical — each site needs a real
      // decision about what the element should *be* (a button, a menuitem, a
      // row with a keyboard path), and the graph canvases in the set are
      // already tracked as #465. Left visible as warnings so the count only
      // moves down.
      //
      // click-events-have-key-events: 11 violations (App, MarkdownBody,
      // MermaidDiagram, StashCard x2, StashViewer x3, TagCombobox).
      'jsx-a11y/click-events-have-key-events': 'warn',
      // no-static-element-interactions: 10 violations, largely the same sites.
      'jsx-a11y/no-static-element-interactions': 'warn',
      // no-noninteractive-element-interactions: 6 violations. Four are
      // deliberate (the two modal backdrops close on click-outside and both
      // dialogs already handle Escape; the Mermaid region and the sidebar
      // separator are focusable widgets). The remaining two are the App
      // toasts, which dismiss on click and need a real dismiss affordance —
      // a design decision, not a mechanical edit.
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
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
