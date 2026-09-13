import { DEMO_USERS } from '../support/constants';
import { expect, test } from '../support/fixtures';

// Runs with the project's authenticated (administrator) storage state.
test.describe('Session lifecycle', () => {
  test('signs out from the user menu and blocks protected routes afterwards', async ({
    page,
    appShell,
  }) => {
    await page.goto('/contacts');
    await appShell.expectSignedInAs(DEMO_USERS.admin.name);

    await appShell.signOut();

    // The session is genuinely gone: a protected route bounces back to sign-in.
    await page.goto('/contacts');
    await expect(page).toHaveURL('/login');
    await expect(page.locator('#email')).toBeVisible();
  });
});
