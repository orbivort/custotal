import { expect, type Locator, type Page } from '@playwright/test';

/** `/pipeline` — the Kanban board of opportunities grouped by stage. */
export class PipelinePage {
  private readonly page: Page;
  readonly heading: Locator;
  readonly listViewButton: Locator;
  readonly boardViewButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Pipeline', level: 1 });
    this.listViewButton = page.getByRole('button', { name: 'List' });
    this.boardViewButton = page.getByRole('button', { name: 'Board' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/pipeline');
    await expect(this.heading).toBeVisible();
  }

  /**
   * The visible board column header for a stage. The same name also appears as
   * a hidden `<option>` in the stage filter and each card's move selector, so
   * restrict to visible matches.
   */
  stageColumn(name: string): Locator {
    return this.page.getByText(name, { exact: true }).filter({ visible: true });
  }

  /** The deal card link (its accessible name also carries account and value). */
  dealCard(name: string): Locator {
    return this.page.locator('a[href^="/opportunities/"]').filter({ hasText: name });
  }
}
