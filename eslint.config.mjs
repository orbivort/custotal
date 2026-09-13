import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/public/**',
      '**/coverage/**',
      '**/.tmp/**',
      'temp/**',
      // Generated test/build artifacts. Prettier also reads .gitignore, so its
      // own ignore list does not have to repeat these; ESLint does NOT read
      // .gitignore, so every gitignored artifact directory must be listed here.
      // Without these, `pnpm lint` fails on Playwright's report JS after
      // `pnpm test:e2e` (and on any Vite/Playwright artifacts left on disk).
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.vite/**',
      // Prisma's generated client (packages/backend/src/generated/prisma). It is a
      // disposable build artifact produced by `pnpm db:generate`; linting it would
      // apply the backend's strict and security rules to generated code.
      '**/src/generated/**',
    ],
  },
  // Core JS recommended rules (typescript-eslint's recommended does NOT include these)
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // react-hooks/set-state-in-effect and react-hooks/refs (React-Compiler-era
      // rules from plugin v7) are enabled: derived-state resets live in event
      // handlers and ref writes happen inside effects.
      // Intentionally disabled: context files deliberately colocate their hook with
      // the provider (useToast/useSession/useMeta — 40+ consumers). Splitting hooks
      // into separate files would enable this rule and improve Fast Refresh granularity.
      'react-refresh/only-export-components': 'off',
      // Throwing anything but an Error subclass loses stack traces and breaks
      // instanceof checks in the centralized error handler.
      'no-throw-literal': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Playwright's fixture API passes a `use` callback to every fixture, which the
  // React hooks rules mistake for React's `use` hook. The e2e suite renders no
  // React, so the hooks rules do not apply there.
  {
    files: ['packages/frontend/e2e/**/*.{ts,tsx}', 'packages/frontend/playwright.config.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  // Backend security linting (practice 6.1): eval/dynamic-require/child-process/
  // ReDoS detection over the API surface and operational scripts.
  {
    files: ['packages/backend/src/**/*.ts', 'packages/backend/scripts/**/*.ts'],
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      // Disabled: TypeScript type-checks every index access, so obj[key] hits in
      // this codebase are statically known and the rule only produces noise.
      'security/detect-object-injection': 'off',
    },
  },
  // `any` remains an escape hatch for test doubles and mock casts only; the
  // backend API surface keeps the strict default of typescript-eslint.
  {
    files: ['packages/backend/src/**/*.ts', 'packages/backend/scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/test/**', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
