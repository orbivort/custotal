import { expect, test } from '../support/fixtures';

test.describe('Pipeline', () => {
  test('renders the board with deal cards grouped by stage', async ({ pipelinePage }) => {
    await pipelinePage.goto();

    // "Lead" also appears as a (hidden) filter option, so target the visible column.
    await expect(pipelinePage.stageColumn('Lead')).toBeVisible();
    await expect(pipelinePage.dealCard('Alpha Q4 Equipment Refresh')).toBeVisible();
    await expect(pipelinePage.dealCard('Charlie Platform Migration')).toBeVisible();
  });

  test('opens a deal detail from the board', async ({ page, pipelinePage }) => {
    await pipelinePage.goto();

    await pipelinePage.dealCard('Alpha Q4 Equipment Refresh').click();

    await expect(page).toHaveURL('/opportunities/o-alpha');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Alpha Q4 Equipment Refresh',
    );
  });

  test('switches between the board and list views', async ({ pipelinePage }) => {
    await pipelinePage.goto();

    await pipelinePage.listViewButton.click();
    await expect(pipelinePage.boardViewButton).toBeVisible();

    await pipelinePage.boardViewButton.click();
    await expect(pipelinePage.dealCard('Alpha Q4 Equipment Refresh')).toBeVisible();
  });
});
