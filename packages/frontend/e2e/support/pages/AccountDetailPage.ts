import { expect, type Locator, type Page } from '@playwright/test';

/** `/accounts/:id` — an account record with edit and (confirmed) delete. */
export class AccountDetailPage {
  private readonly page: Page;
  readonly editButton: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // `exact` keeps these off the timeline's "Edit interaction" /
    // "Delete interaction" buttons, which also contain the words.
    this.editButton = page.getByRole('button', { name: 'Edit', exact: true });
    this.deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
  }

  heading(name: string): Locator {
    return this.page.getByRole('heading', { name, level: 1 });
  }

  async expectShows(name: string): Promise<void> {
    await expect(this.heading(name)).toBeVisible();
  }

  async openEdit(): Promise<void> {
    await this.editButton.click();
    await expect(this.page).toHaveURL(/\/accounts\/[^/]+\/edit$/);
  }

  /** Confirms the destructive dialog and asserts the return to the list. */
  async deleteAndConfirm(): Promise<void> {
    await this.deleteButton.click();
    const dialog = this.page.getByRole('dialog', { name: 'Delete account' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(this.page).toHaveURL('/accounts');
  }
}
