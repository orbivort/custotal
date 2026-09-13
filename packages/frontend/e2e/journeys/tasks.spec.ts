import { expect, test } from '../support/fixtures';

test.describe('Tasks', () => {
  test('lists follow-ups, widens the scope and filters by status', async ({ tasksPage }) => {
    await tasksPage.goto();

    // Default scope is the signed-in administrator's own follow-ups.
    await expect(tasksPage.task('Approve Charlie discount request')).toBeVisible();

    await tasksPage.allTasksButton.click();
    await expect(tasksPage.task('Send Alpha proposal deck')).toBeVisible();

    await tasksPage.statusFilter.selectOption('completed');
    await expect(tasksPage.task('Send Alpha proposal deck')).toHaveCount(0);
    await expect(tasksPage.task('Review new user access requests')).toBeVisible();
  });

  test('filters by priority', async ({ tasksPage }) => {
    await tasksPage.goto();
    await tasksPage.allTasksButton.click();

    await tasksPage.priorityFilter.selectOption('low');
    await expect(tasksPage.task('Update team quota spreadsheet')).toBeVisible();
    await expect(tasksPage.task('Send Alpha proposal deck')).toHaveCount(0);
  });
});
