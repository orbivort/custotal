import { expect, test } from '../support/fixtures';

test.describe('Dashboard', () => {
  test('renders the seeded KPIs and the largest open deals', async ({ dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.expectGreetedAs('Admin');

    // "Open pipeline" is also a section heading, so match the first occurrence.
    await expect(dashboardPage.kpi('Open pipeline').first()).toBeVisible();
    await expect(dashboardPage.kpi('Closing this month')).toBeVisible();
    await expect(dashboardPage.kpi('Tasks due today')).toBeVisible();
    await expect(dashboardPage.kpi('Won this month')).toBeVisible();

    // The highest-value open deal in the demo seed.
    await expect(dashboardPage.topDeal('Charlie Platform Migration')).toBeVisible();
  });

  test('links the pipeline section to the board', async ({ page, dashboardPage }) => {
    await dashboardPage.goto();

    await page.getByRole('link', { name: 'View board' }).click();
    await expect(page).toHaveURL('/pipeline');
    await expect(page.getByRole('heading', { name: 'Pipeline', level: 1 })).toBeVisible();
  });
});
