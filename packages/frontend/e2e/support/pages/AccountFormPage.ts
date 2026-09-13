import { expect, type Locator, type Page } from '@playwright/test';

export interface AccountFormValues {
  name?: string;
  industry?: string;
  website?: string;
  phone?: string;
  billingAddress?: string;
  notes?: string;
}

/** `/accounts/new` and `/accounts/:id/edit` — the shared account form. */
export class AccountFormPage {
  private readonly page: Page;
  readonly name: Locator;
  readonly industry: Locator;
  readonly website: Locator;
  readonly phone: Locator;
  readonly billingAddress: Locator;
  readonly notes: Locator;
  readonly createButton: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.name = page.locator('#name');
    this.industry = page.locator('#industry');
    this.website = page.locator('#website');
    this.phone = page.locator('#phone');
    this.billingAddress = page.locator('#billingAddress');
    this.notes = page.locator('#notes');
    this.createButton = page.getByRole('button', { name: 'Create account' });
    this.saveButton = page.getByRole('button', { name: 'Save changes' });
  }

  async expectNew(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'New account', level: 1 })).toBeVisible();
  }

  async expectEdit(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Edit account', level: 1 })).toBeVisible();
  }

  async fill(values: AccountFormValues): Promise<void> {
    if (values.name !== undefined) await this.name.fill(values.name);
    if (values.industry !== undefined) await this.industry.fill(values.industry);
    if (values.website !== undefined) await this.website.fill(values.website);
    if (values.phone !== undefined) await this.phone.fill(values.phone);
    if (values.billingAddress !== undefined) await this.billingAddress.fill(values.billingAddress);
    if (values.notes !== undefined) await this.notes.fill(values.notes);
  }

  async create(): Promise<void> {
    await this.createButton.click();
    await expect(this.page).toHaveURL(/\/accounts\/[^/]+$/);
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.page).toHaveURL(/\/accounts\/[^/]+$/);
  }

  error(message: string): Locator {
    return this.page.getByText(message, { exact: true });
  }
}
