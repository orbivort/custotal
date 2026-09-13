import { expect, type Locator, type Page } from '@playwright/test';

/** `/accounts` — the account card grid with search, owner and sort controls. */
export class AccountsListPage {
  private readonly page: Page;
  readonly heading: Locator;
  readonly search: Locator;
  readonly newAccountLink: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Accounts', level: 1 });
    this.search = page.getByLabel('Search accounts');
    // `/accounts/new` is also an `/accounts/` href, so exclude it explicitly.
    this.newAccountLink = page.locator('a[href$="/accounts/new"]');
    this.emptyState = page.getByText('No accounts found');
  }

  async goto(): Promise<void> {
    await this.page.goto('/accounts');
    await expect(this.heading).toBeVisible();
  }

  /** The card for an account, matched by its (unique) name. */
  card(name: string): Locator {
    return this.page.locator('a[href*="/accounts/"]').filter({ hasText: name });
  }

  async searchFor(term: string): Promise<void> {
    await this.search.fill(term);
  }

  async openNewAccount(): Promise<void> {
    await this.newAccountLink.click();
    await expect(this.page).toHaveURL('/accounts/new');
  }

  async open(name: string): Promise<void> {
    await this.card(name).click();
    await expect(this.page.getByRole('heading', { name, level: 1 })).toBeVisible();
  }
}
