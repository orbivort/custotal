import { expect, type Locator, type Page } from '@playwright/test';

/** `/` — the KPI dashboard. Its heading is a time-based greeting. */
export class DashboardPage {
  private readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.heading).toBeVisible();
  }

  /** Asserts the greeting addresses the signed-in user by first name. */
  async expectGreetedAs(firstName: string): Promise<void> {
    await expect(this.heading).toContainText(firstName);
  }

  kpi(label: string): Locator {
    return this.page.getByText(label, { exact: true });
  }

  topDeal(name: string): Locator {
    return this.page.getByRole('link', { name: new RegExp(name) });
  }
}
