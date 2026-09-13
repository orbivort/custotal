import { expect, test } from '../support/fixtures';

// Route guards are only observable without a session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Route guards', () => {
  test('bounces anonymous visitors on a protected route to sign-in', async ({ page }) => {
    await page.goto('/pipeline');

    await expect(page).toHaveURL('/login');
    await expect(page.locator('#email')).toBeVisible();
  });

  test('bounces anonymous visitors on an unknown route to sign-in', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');

    await expect(page).toHaveURL('/login');
  });
});
