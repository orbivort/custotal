import { test as setup } from '@playwright/test';
import {
  ADMIN_STATE,
  DEMO_PASSWORD,
  DEMO_USERS,
  REP_STATE,
  ensureAuthDir,
} from '../support/constants';
import { AppShell } from '../support/pages/AppShell';
import { LoginPage } from '../support/pages/LoginPage';

// Runs once before the browser projects (they declare `dependencies: ['setup']`)
// and persists one storage state per role. Every browser project then starts
// already signed in and — because Playwright gives each test a fresh context —
// each test still starts from an untouched demo dataset.

setup('authenticate as an administrator', async ({ page }) => {
  ensureAuthDir();
  const login = new LoginPage(page);
  await login.goto();
  await login.signIn(DEMO_USERS.admin.email, DEMO_PASSWORD);
  await new AppShell(page).expectSignedInAs(DEMO_USERS.admin.name);
  await page.context().storageState({ path: ADMIN_STATE });
});

setup('authenticate as a sales rep', async ({ page }) => {
  ensureAuthDir();
  const login = new LoginPage(page);
  await login.goto();
  await login.signIn(DEMO_USERS.rep.email, DEMO_PASSWORD);
  await new AppShell(page).expectSignedInAs(DEMO_USERS.rep.name);
  await page.context().storageState({ path: REP_STATE });
});
