import { test as base, type Page } from '@playwright/test';
import { AccountDetailPage } from './pages/AccountDetailPage';
import { AccountFormPage } from './pages/AccountFormPage';
import { AccountsListPage } from './pages/AccountsListPage';
import { AppShell } from './pages/AppShell';
import { ContactDetailPage } from './pages/ContactDetailPage';
import { ContactFormPage } from './pages/ContactFormPage';
import { ContactsListPage } from './pages/ContactsListPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { PipelinePage } from './pages/PipelinePage';
import { TasksPage } from './pages/TasksPage';

/**
 * A same-origin document that is deliberately *not* the SPA. Reaching
 * `navigator.serviceWorker` needs a document of this origin, and booting the
 * application to get one would defeat the purpose of the reset below.
 */
const WORKER_RESET_PATH = '/__e2e/service-worker-reset__';
const WORKER_RESET_GLOB = `**${WORKER_RESET_PATH}`;

/**
 * Clears the mock service worker before the application boots.
 *
 * Playwright gives every test a fresh browser context, but a Service Worker
 * registration belongs to the browser rather than to the context — Firefox in
 * particular lets a registration outlive the context that created it. A test
 * that inherits one starts in a state the mock worker cannot survive: the
 * leftover registration stops controlling the new page (which makes MSW reload
 * it) and is still being torn down when the reloaded page registers again
 * (which makes MSW's bootstrap either fail to find a worker or never settle).
 * The application then never mounts, so every assertion fails against a blank
 * page, for reasons that have nothing to do with the behaviour under test.
 *
 * Clearing the registry from a throwaway document of this origin — and waiting
 * for it to actually drain — means each test boots the mock worker from scratch,
 * which is the state MSW is designed for.
 */
async function resetMockWorker(page: Page): Promise<void> {
  await page.route(WORKER_RESET_GLOB, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>service worker reset</title>',
    }),
  );
  try {
    await page.goto(WORKER_RESET_PATH);
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      // `unregister()` resolves as soon as the unregistration is accepted; the
      // registration is what has to be gone before the next page load.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const remaining = await navigator.serviceWorker.getRegistrations();
        if (remaining.length === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    });
  } finally {
    await page.unroute(WORKER_RESET_GLOB);
  }
}

/**
 * Page-object fixtures shared by every spec. Each is built lazily from the
 * test's own `page`, so it is torn down with the test's browser context and can
 * never leak state into the next test.
 */
interface CustotalFixtures {
  /** Auto fixture carrying no value; see `resetMockWorker`. */
  mockWorkerReset: void;
  loginPage: LoginPage;
  appShell: AppShell;
  dashboardPage: DashboardPage;
  contactsListPage: ContactsListPage;
  contactFormPage: ContactFormPage;
  contactDetailPage: ContactDetailPage;
  accountsListPage: AccountsListPage;
  accountFormPage: AccountFormPage;
  accountDetailPage: AccountDetailPage;
  pipelinePage: PipelinePage;
  tasksPage: TasksPage;
}

export const test = base.extend<CustotalFixtures>({
  mockWorkerReset: [
    async ({ page }, use) => {
      await resetMockWorker(page);
      await use();
    },
    { auto: true },
  ],
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  appShell: async ({ page }, use) => {
    await use(new AppShell(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  contactsListPage: async ({ page }, use) => {
    await use(new ContactsListPage(page));
  },
  contactFormPage: async ({ page }, use) => {
    await use(new ContactFormPage(page));
  },
  contactDetailPage: async ({ page }, use) => {
    await use(new ContactDetailPage(page));
  },
  accountsListPage: async ({ page }, use) => {
    await use(new AccountsListPage(page));
  },
  accountFormPage: async ({ page }, use) => {
    await use(new AccountFormPage(page));
  },
  accountDetailPage: async ({ page }, use) => {
    await use(new AccountDetailPage(page));
  },
  pipelinePage: async ({ page }, use) => {
    await use(new PipelinePage(page));
  },
  tasksPage: async ({ page }, use) => {
    await use(new TasksPage(page));
  },
});

export { expect } from '@playwright/test';
