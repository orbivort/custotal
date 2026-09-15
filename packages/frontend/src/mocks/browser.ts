import { setupWorker } from 'msw/browser';
import { accountHandlers } from './handlers/accounts';
import { adminHandlers } from './handlers/admin';
import { authHandlers } from './handlers/auth';
import { contactHandlers } from './handlers/contacts';
import { importHandlers } from './handlers/import';
import { interactionHandlers } from './handlers/interactions';
import { metaHandlers } from './handlers/meta';
import { opportunityHandlers } from './handlers/opportunities';
import { reportHandlers } from './handlers/reports';
import { searchHandlers } from './handlers/search';
import { taskHandlers } from './handlers/tasks';

/**
 * The worker script itself — it is served out of `public/`, not from this graph.
 * Resolved against Vite's BASE_URL rather than hardcoded to the origin root, so
 * the registration follows the deployed sub-path (GitHub Pages serves the demo
 * build from /<repo>/) and the worker's scope still covers the application.
 */
const WORKER_SCRIPT_URL = `${import.meta.env.BASE_URL}mockServiceWorker.js`;

export const worker = setupWorker(
  ...authHandlers,
  ...adminHandlers,
  ...metaHandlers,
  ...importHandlers,
  ...contactHandlers,
  ...accountHandlers,
  ...interactionHandlers,
  ...opportunityHandlers,
  ...taskHandlers,
  ...reportHandlers,
  ...searchHandlers,
);

/** Whether a registration belongs to the mock worker script. */
function isMockWorker(registration: ServiceWorkerRegistration): boolean {
  const script = (registration.active ?? registration.waiting ?? registration.installing)
    ?.scriptURL;
  return script === new URL(WORKER_SCRIPT_URL, location.href).href;
}

/**
 * Drops a mock worker registration that does not control the current document.
 *
 * `worker.start()` reloads the page whenever it finds a registration of its own
 * worker script that does not control the document. That reload is only meant to
 * happen on the very first visit, but it is not harmless: a document that is
 * reloaded while the worker is still bootstrapping can end up with `start()`
 * never settling, or — in Firefox, against a registration that is still being
 * torn down — with a registration that holds no worker in any state at all. The
 * application then never mounts and the user is left on a blank page.
 *
 * Leaving a stale registration in the profile is exactly what produces that
 * state (a browser restarted mid-registration, or a test runner that reuses one
 * browser profile for many short-lived pages), so drop it and let `start()`
 * register a worker it fully controls. Nothing is lost: the script is re-fetched
 * from the dev server. A registration that does control this document is kept,
 * because that is the healthy state `start()` expects.
 */
async function dropStaleRegistration(): Promise<void> {
  if (!navigator.serviceWorker.controller) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const stale = registrations.filter(isMockWorker);
    if (stale.length > 0) {
      await Promise.all(stale.map((registration) => registration.unregister()));
      // `unregister()` resolves as soon as the unregistration is accepted, and a
      // registration that is still on its way out is precisely what makes
      // `worker.start()` fail to locate a worker, so wait for the registry to drain.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const remaining = (await navigator.serviceWorker.getRegistrations()).filter(isMockWorker);
        if (remaining.length === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
}

/**
 * Starts the mock API against the seeded demo workspace. Callers must treat a
 * rejection as non-fatal and carry on rendering: the mocks are a development
 * convenience, while the application is not.
 */
export async function startMockApi(): Promise<void> {
  await dropStaleRegistration();
  await worker.start({
    onUnhandledRequest: 'bypass',
    // MSW registers its worker at the origin root ("/mockServiceWorker.js") by
    // default, which 404s whenever the bundle is served from a sub-path — the
    // GitHub Pages demo lives under /<repo>/. Passing the base-prefixed URL also
    // keeps the registration's scope over the application; a worker registered a
    // level up would leave the page uncontrolled and intercept nothing.
    serviceWorker: { url: WORKER_SCRIPT_URL },
  });
}
