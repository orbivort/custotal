import { DEMO_USERS, REP_STATE } from '../support/constants';
import { expect, test } from '../support/fixtures';

// A sales rep has write access to records but no administrative privileges.
test.use({ storageState: REP_STATE });

test.describe('Role-based access', () => {
  test('a rep sees no admin navigation and is redirected away from /admin', async ({
    page,
    appShell,
  }) => {
    await page.goto('/');
    await appShell.expectSignedInAs(DEMO_USERS.rep.name);

    await expect(appShell.navLink('Overview')).toHaveCount(0);
    await expect(appShell.navLink('Users & roles')).toHaveCount(0);

    await page.goto('/admin/users');
    // RequireRole sends unauthorised roles back to the dashboard.
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a rep can still reach the shared record pages', async ({ page, appShell }) => {
    await page.goto('/');
    await appShell.navigateTo('Contacts');

    await expect(page).toHaveURL('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts', level: 1 })).toBeVisible();
  });
});
