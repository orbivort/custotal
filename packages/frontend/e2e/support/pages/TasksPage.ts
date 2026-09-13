import { expect, type Locator, type Page } from '@playwright/test';

/** `/tasks` — the follow-up list with status/priority/owner filters. */
export class TasksPage {
  private readonly page: Page;
  readonly heading: Locator;
  readonly statusFilter: Locator;
  readonly priorityFilter: Locator;
  readonly allTasksButton: Locator;
  readonly myTasksButton: Locator;
  readonly newTaskButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Tasks', level: 1 });
    this.statusFilter = page.getByLabel('Filter by status');
    this.priorityFilter = page.getByLabel('Filter by priority');
    this.allTasksButton = page.getByRole('button', { name: 'All tasks' });
    this.myTasksButton = page.getByRole('button', { name: 'My tasks' });
    this.newTaskButton = page.getByRole('button', { name: 'New task' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/tasks');
    await expect(this.heading).toBeVisible();
  }

  task(title: string): Locator {
    return this.page.getByText(title, { exact: true });
  }
}
