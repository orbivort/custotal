import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted IBM Plex fonts (Fontsource) — replaces the Google Fonts CDN
// link that used to live in index.html. Vite copies the referenced woff2
// files into the build output, so no external font host is contacted.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/ibm-plex-sans/500-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import App from './App';
import './index.css';
import { env } from './config/env';

async function bootstrap() {
  // MSW is an opt-in development tool (VITE_ENABLE_MOCKS=true). The outer
  // `import.meta.env.DEV` test is replaced with `false` by Vite in production
  // and preview builds, so this whole block — including the dynamic import of
  // the MSW module graph — is removed from the production bundle.
  //
  // Starting the mock API must never gate the render: the boot can fail (see
  // startMockApi), and an unhandled rejection here would leave the user staring
  // at a blank page. Mocking is a convenience; the UI is not.
  if (import.meta.env.DEV) {
    if (env.mocksEnabled) {
      try {
        await (await import('./mocks/browser')).startMockApi();
      } catch (error) {
        console.error(
          '[mocks] The mock API could not be started, so API calls will reach the dev proxy instead.',
          error,
        );
      }
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
