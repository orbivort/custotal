import { expect, type Locator, type Page } from '@playwright/test';

/** The authenticated chrome: sidebar navigation plus the topbar user menu. */
export class AppShell {
  private readonly page: Page;
  readonly sidebarNav: Locator;
  readonly accountMenu: Locator;
  readonly signOutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebarNav = page.locator('#sidebar-nav');
    this.accountMenu = page.locator('header button[aria-haspopup="menu"]');
    this.signOutButton = page.getByRole('button', { name: 'Sign out' });
  }

  /** Scopes to the sidebar: several page links reuse the same label. */
  navLink(label: string): Locator {
    return this.sidebarNav.getByRole('link', { name: label, exact: true });
  }

  async expectSignedInAs(name: string): Promise<void> {
    await expect(this.sidebarNav).toBeVisible();
    await expect(this.page.locator('header').getByText(name, { exact: true })).toBeVisible();
  }

  async navigateTo(label: string): Promise<void> {
    await this.navLink(label).click();
  }

  /** Opens the user menu and signs out, asserting the login redirect. */
  async signOut(): Promise<void> {
    await this.accountMenu.click();
    await this.signOutButton.click();
    await expect(this.page).toHaveURL('/login');
  }
}
