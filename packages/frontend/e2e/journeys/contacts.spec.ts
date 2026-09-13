import { expect, test } from '../support/fixtures';

test.describe('Contacts', () => {
  test('lists the seeded contacts', async ({ contactsListPage }) => {
    await contactsListPage.goto();

    await expect(contactsListPage.row('Laura Alpha')).toBeVisible();
    await expect(contactsListPage.row('Marcus Bravo')).toBeVisible();
  });

  test('filters the list with the search field', async ({ contactsListPage }) => {
    await contactsListPage.goto();
    await expect(contactsListPage.row('Marcus Bravo')).toBeVisible();

    await contactsListPage.searchFor('Laura');

    await expect(contactsListPage.row('Laura Alpha')).toBeVisible();
    await expect(contactsListPage.row('Marcus Bravo')).toHaveCount(0);
  });

  test('shows an empty state when nothing matches', async ({ contactsListPage }) => {
    await contactsListPage.goto();

    await contactsListPage.searchFor('zzzzz-no-such-contact');

    await expect(contactsListPage.emptyState).toBeVisible();
  });

  test('validates required fields before creating', async ({
    page,
    contactsListPage,
    contactFormPage,
  }) => {
    await contactsListPage.goto();
    await contactsListPage.openNewContact();
    await contactFormPage.expectNew();

    await contactFormPage.createButton.click();

    await expect(contactFormPage.error('First name is required.')).toBeVisible();
    await expect(contactFormPage.error('Last name is required.')).toBeVisible();
    await expect(
      contactFormPage.error('At least one of email or phone is required.'),
    ).toBeVisible();
    await expect(page).toHaveURL('/contacts/new');
  });

  test('rejects a malformed email address', async ({ page, contactsListPage, contactFormPage }) => {
    await contactsListPage.goto();
    await contactsListPage.openNewContact();

    await contactFormPage.fill({ firstName: 'Bad', lastName: 'Email', email: 'not-an-email' });
    await contactFormPage.createButton.click();

    await expect(contactFormPage.error('Invalid email format.')).toBeVisible();
    await expect(page).toHaveURL('/contacts/new');
  });

  test('creates a contact and opens its detail page', async ({
    page,
    contactsListPage,
    contactFormPage,
  }) => {
    await contactsListPage.goto();
    await contactsListPage.openNewContact();

    await contactFormPage.fill({
      firstName: 'Nina',
      lastName: 'Newcomer',
      email: 'nina.newcomer@example.com',
      jobTitle: 'Chief Technology Officer',
    });
    await contactFormPage.create();

    await expect(page.getByRole('heading', { name: 'Nina Newcomer', level: 1 })).toBeVisible();
    await expect(page.getByText('Chief Technology Officer')).toBeVisible();
    await expect(page.getByText('nina.newcomer@example.com')).toBeVisible();
  });

  test('edits a contact and reflects the change on the detail page', async ({
    page,
    contactsListPage,
    contactDetailPage,
    contactFormPage,
  }) => {
    await contactsListPage.goto();
    await contactsListPage.open('Laura Alpha');

    await contactDetailPage.openEdit();
    await contactFormPage.expectEdit();
    await contactFormPage.fill({ jobTitle: 'Chief Operating Officer' });
    await contactFormPage.save();

    await expect(page).toHaveURL('/contacts/c-laura');
    await expect(page.getByText('Chief Operating Officer')).toBeVisible();
  });

  test('deletes a contact after confirming', async ({
    page,
    contactsListPage,
    contactDetailPage,
  }) => {
    await contactsListPage.goto();
    await contactsListPage.open('Marcus Bravo');

    await contactDetailPage.deleteAndConfirm();

    await expect(page.getByRole('status').filter({ hasText: 'Contact deleted' })).toBeVisible();
    await expect(contactsListPage.row('Laura Alpha')).toBeVisible();
    await expect(contactsListPage.row('Marcus Bravo')).toHaveCount(0);
  });
});
