import { expect, type Locator, type Page } from '@playwright/test';

/** `/contacts` — the paginated contact list with search and filters. */
export class ContactsListPage {
  private readonly page: Page;
  readonly heading: Locator;
  readonly search: Locator;
  readonly statusFilter: Locator;
  readonly newContactLink: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Contacts', level: 1 });
    this.search = page.getByLabel('Search contacts');
    this.statusFilter = page.getByLabel('Filter by status');
    this.newContactLink = page.getByRole('link', { name: 'New contact' });
    this.emptyState = page.getByText('No contacts found');
  }

  async goto(): Promise<void> {
    await this.page.goto('/contacts');
    await expect(this.heading).toBeVisible();
  }

  /** The full-name link in the table row for a contact. */
  row(fullName: string): Locator {
    return this.page.getByRole('link', { name: fullName, exact: true });
  }

  async searchFor(term: string): Promise<void> {
    await this.search.fill(term);
  }

  async openNewContact(): Promise<void> {
    await this.newContactLink.click();
    await expect(this.page).toHaveURL('/contacts/new');
  }

  async open(fullName: string): Promise<void> {
    await this.row(fullName).click();
    await expect(this.page.getByRole('heading', { name: fullName, level: 1 })).toBeVisible();
  }
}
