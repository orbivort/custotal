import { expect, type Locator, type Page } from '@playwright/test';

/**
 * `/login` — the sign-in form, including its inline validation and the
 * instance-probe gate that renders a spinner until `GET /api/health` resolves.
 */
export class LoginPage {
  private readonly page: Page;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly forgotPassword: Locator;

  constructor(page: Page) {
    this.page = page;
    // Ids, not labels: the password field is labelled "Password*" and a
    // neighbouring toggle carries aria-label "Show password", so label-based
    // lookups would match more than one element.
    this.email = page.locator('#email');
    this.password = page.locator('#password');
    this.submit = page.getByRole('button', { name: 'Sign in' });
    this.forgotPassword = page.getByRole('button', { name: 'Forgot password?' });
  }

  /** Waits until the probe has resolved and the form is interactive. */
  async expectReady(): Promise<void> {
    await expect(this.email).toBeVisible();
    await expect(this.submit).toBeVisible();
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
    await this.expectReady();
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }

  /** Signs in and waits for the app shell, or the error banner on failure. */
  async signInExpectingShell(email: string, password: string): Promise<void> {
    await this.signIn(email, password);
    await expect(this.page.locator('#sidebar-nav')).toBeVisible();
  }
}
