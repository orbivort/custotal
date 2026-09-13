import { expect, test } from '../support/fixtures';

test.describe('Accounts', () => {
  test('lists the seeded accounts', async ({ accountsListPage }) => {
    await accountsListPage.goto();

    await expect(accountsListPage.card('Alpha Manufacturing')).toBeVisible();
    await expect(accountsListPage.card('Charlie Technology')).toBeVisible();
  });

  test('validates the required account name', async ({
    page,
    accountsListPage,
    accountFormPage,
  }) => {
    await accountsListPage.goto();
    await accountsListPage.openNewAccount();
    await accountFormPage.expectNew();

    await accountFormPage.createButton.click();

    await expect(accountFormPage.error('Account name is required.')).toBeVisible();
    await expect(page).toHaveURL('/accounts/new');
  });

  test('creates an account and opens its detail page', async ({
    page,
    accountsListPage,
    accountFormPage,
  }) => {
    await accountsListPage.goto();
    await accountsListPage.openNewAccount();

    await accountFormPage.fill({
      name: 'Northwind Traders',
      industry: 'Logistics',
      website: 'northwind.example',
    });
    await accountFormPage.create();

    await expect(page.getByRole('heading', { name: 'Northwind Traders', level: 1 })).toBeVisible();
    await expect(page.getByText('northwind.example')).toBeVisible();
  });

  test('edits an account and reflects the change on the detail page', async ({
    page,
    accountsListPage,
    accountDetailPage,
    accountFormPage,
  }) => {
    await accountsListPage.goto();
    await accountsListPage.open('Alpha Manufacturing');

    await accountDetailPage.openEdit();
    await accountFormPage.expectEdit();
    await accountFormPage.fill({ industry: 'Heavy Industry' });
    await accountFormPage.save();

    await expect(page).toHaveURL('/accounts/a-alpha');
    await expect(page.getByText(/Heavy Industry/).first()).toBeVisible();
  });

  test('deletes an account after confirming', async ({
    page,
    accountsListPage,
    accountDetailPage,
  }) => {
    await accountsListPage.goto();
    await accountsListPage.open('Echo Aerospace');

    await accountDetailPage.deleteAndConfirm();

    await expect(page.getByRole('status').filter({ hasText: 'Account deleted' })).toBeVisible();
    await expect(accountsListPage.card('Alpha Manufacturing')).toBeVisible();
    await expect(accountsListPage.card('Echo Aerospace')).toHaveCount(0);
  });
});
