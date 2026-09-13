import { expect, type Locator, type Page } from '@playwright/test';

export interface ContactFormValues {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  company?: string;
  notes?: string;
}

/** `/contacts/new` and `/contacts/:id/edit` — the shared contact form. */
export class ContactFormPage {
  private readonly page: Page;
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly email: Locator;
  readonly phone: Locator;
  readonly jobTitle: Locator;
  readonly company: Locator;
  readonly notes: Locator;
  readonly createButton: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.firstName = page.locator('#firstName');
    this.lastName = page.locator('#lastName');
    this.email = page.locator('#email');
    this.phone = page.locator('#phone');
    this.jobTitle = page.locator('#jobTitle');
    this.company = page.locator('#company');
    this.notes = page.locator('#notes');
    this.createButton = page.getByRole('button', { name: 'Create contact' });
    this.saveButton = page.getByRole('button', { name: 'Save changes' });
  }

  async expectNew(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'New contact', level: 1 })).toBeVisible();
  }

  async expectEdit(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Edit contact', level: 1 })).toBeVisible();
  }

  async fill(values: ContactFormValues): Promise<void> {
    if (values.firstName !== undefined) await this.firstName.fill(values.firstName);
    if (values.lastName !== undefined) await this.lastName.fill(values.lastName);
    if (values.email !== undefined) await this.email.fill(values.email);
    if (values.phone !== undefined) await this.phone.fill(values.phone);
    if (values.jobTitle !== undefined) await this.jobTitle.fill(values.jobTitle);
    if (values.company !== undefined) await this.company.fill(values.company);
    if (values.notes !== undefined) await this.notes.fill(values.notes);
  }

  /** Submits a new contact and asserts the detail redirect. */
  async create(): Promise<void> {
    await this.createButton.click();
    await expect(this.page).toHaveURL(/\/contacts\/[^/]+$/);
  }

  /** Submits edits and asserts the return to the detail page. */
  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.page).toHaveURL(/\/contacts\/[^/]+$/);
  }

  error(message: string): Locator {
    return this.page.getByText(message, { exact: true });
  }
}
