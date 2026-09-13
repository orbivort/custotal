import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The package manifest is the single source of truth for the app version. It is
// read at config time and injected into index.html so the <title> can never
// drift from package.json when the version is bumped.
const { version: appVersion } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

// Replaces the __APP_VERSION__ placeholder in index.html. A non-percent token is
// used deliberately: Vite's built-in HTML env replacement owns /%VAR%/ syntax.
function appVersionPlugin(): Plugin {
  return {
    name: 'custotal:app-version',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('__APP_VERSION__', appVersion),
    },
  };
}

export default defineConfig(({ mode }) => {
  // Dev-only transport for real API traffic. When the app is not running with
  // MSW (VITE_ENABLE_MOCKS=true), relative /api/* requests are forwarded to the
  // backend. Keeping requests same-origin means the HttpOnly ct_session cookie
  // flows without CORS/SameSite edge cases. Requests made against an absolute
  // VITE_API_BASE_URL (cross-origin deployments) bypass this proxy entirely.
  const viteEnv = loadEnv(mode, process.cwd(), '');
  const proxyTarget =
    viteEnv.VITE_API_PROXY_TARGET || viteEnv.VITE_API_BASE_URL || 'http://localhost:4000';

  return {
    plugins: [appVersionPlugin(), react(), tailwindcss()],

    server: {
      // Bind to 0.0.0.0 so the dev server is reachable from Docker and remote hosts.
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
      warmup: {
        // Pre-transform the entry (and everything it eagerly imports through App.tsx)
        // at server start so the first page load doesn't pay a transform waterfall.
        clientFiles: ['./src/main.tsx'],
      },
    },

    build: {
      rolldownOptions: {
        output: {
          // Vite 8 uses Rolldown: manualChunks (Rollup API) is deprecated in favour of
          // output.codeSplitting.groups. Keep the React family in a stable, separately
          // cached chunk while letting Rolldown decide the rest of the split.
          codeSplitting: {
            groups: [
              {
                name: 'react-vendor',
                test: /node_modules[\\/](?:react|react-dom|react-router|scheduler)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
  };
});
