import { expect, test } from '../support/fixtures';

const SECTIONS = [
  { label: 'Contacts', path: '/contacts', heading: 'Contacts' },
  { label: 'Accounts', path: '/accounts', heading: 'Accounts' },
  { label: 'Pipeline', path: '/pipeline', heading: 'Pipeline' },
  { label: 'Tasks', path: '/tasks', heading: 'Tasks' },
] as const;

test.describe('Primary navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#sidebar-nav')).toBeVisible();
  });

  for (const section of SECTIONS) {
    test(`opens ${section.label} from the sidebar`, async ({ page, appShell }) => {
      await appShell.navigateTo(section.label);

      await expect(page).toHaveURL(section.path);
      await expect(page.getByRole('heading', { name: section.heading, level: 1 })).toBeVisible();
      // The active item is exposed to assistive technology, not just styled.
      await expect(appShell.navLink(section.label)).toHaveAttribute('aria-current', 'page');
    });
  }

  test('reports a matching entry for the section the user is on', async ({ page, appShell }) => {
    await appShell.navigateTo('Accounts');
    await expect(page).toHaveURL('/accounts');

    // Previously-active items must drop their current-page marker.
    await appShell.navigateTo('Contacts');
    await expect(appShell.navLink('Contacts')).toHaveAttribute('aria-current', 'page');
    await expect(appShell.navLink('Accounts')).not.toHaveAttribute('aria-current', 'page');
  });

  test('returns to the dashboard from a section', async ({ page, appShell }) => {
    await appShell.navigateTo('Tasks');
    await expect(page).toHaveURL('/tasks');

    await appShell.navigateTo('Dashboard');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Admin');
  });

  test('redirects an unknown route to the dashboard', async ({ page }) => {
    await page.goto('/definitely-not-a-real-route');

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
