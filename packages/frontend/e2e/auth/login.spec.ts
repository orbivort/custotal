import { DEMO_PASSWORD, DEMO_USERS } from '../support/constants';
import { expect, test } from '../support/fixtures';

// Sign-in journeys must start from a clean, unauthenticated context, so this
// file overrides the authenticated storage state the browser projects inject.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Sign in', () => {
  test('blocks an empty submission with per-field errors', async ({ page, loginPage }) => {
    await loginPage.goto();
    // The demo workspace pre-fills the credentials, so clear them first.
    await loginPage.email.fill('');
    await loginPage.password.fill('');
    await loginPage.submit.click();

    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Email is required.')).toBeVisible();
    await expect(page.getByText('Password is required.')).toBeVisible();
  });

  test('reports invalid credentials and points at the password field', async ({
    page,
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.signIn(DEMO_USERS.admin.email, 'definitely-not-the-password');

    await expect(page.getByText('Invalid email or password.')).toBeVisible();
    await expect(page.getByText('Check your password.')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('signs in and lands on the dashboard', async ({
    page,
    loginPage,
    appShell,
    dashboardPage,
  }) => {
    await loginPage.goto();
    await loginPage.signIn(DEMO_USERS.admin.email, DEMO_PASSWORD);

    await appShell.expectSignedInAs(DEMO_USERS.admin.name);
    await expect(page).toHaveURL('/');
    await dashboardPage.expectGreetedAs('Admin');
  });

  test('returns the user to the page they originally requested', async ({
    page,
    loginPage,
    appShell,
  }) => {
    // An anonymous deep link is bounced to /login with the target preserved.
    await page.goto('/accounts');
    await expect(page).toHaveURL('/login');

    await loginPage.expectReady();
    await loginPage.signIn(DEMO_USERS.admin.email, DEMO_PASSWORD);

    await appShell.expectSignedInAs(DEMO_USERS.admin.name);
    await expect(page).toHaveURL('/accounts');
    await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible();
  });
});
