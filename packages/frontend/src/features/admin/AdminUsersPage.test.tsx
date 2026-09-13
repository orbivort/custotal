// Component tests for AdminUsersPage (list, create, edit, role change, delete).
//
// External collaborators are mocked so the tests focus on page behavior:
// - adminApi.listUsers/createUser/updateUser/deleteUser -> list + mutations
// - MetaContext.useMeta                                 -> metadata refresh
// - SessionContext.useSession                           -> "you" row + guards
// - toast.useToast                                      -> export feedback
// ApiError comes from the real lib/api so validation-detail mapping is real.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import type { User } from '../../types/domain';
import AdminUsersPage from './AdminUsersPage';

const h = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  refresh: vi.fn(),
  show: vi.fn(),
}));

vi.mock('./adminApi', () => ({
  listUsers: h.listUsers,
  createUser: h.createUser,
  updateUser: h.updateUser,
  deleteUser: h.deleteUser,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Grace Hopper', email: 'grace@example.com', role: 'rep' },
  { id: 'u3', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminUsersPage />
    </MemoryRouter>,
  );
}

describe('AdminUsersPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({ refresh: h.refresh });
    h.useSession.mockReturnValue({ user: USERS[0] });
    h.refresh.mockResolvedValue(undefined);
    h.listUsers.mockResolvedValue(USERS);
    h.createUser.mockResolvedValue({
      user: { id: 'u9', name: 'New User', email: 'new@example.com', role: 'rep' },
      inviteSent: true,
    });
    h.updateUser.mockImplementation(async (id: string, input: Partial<User>) => {
      const current = USERS.find((u) => u.id === id) ?? USERS[0];
      return { ...current, ...input } as User;
    });
    h.deleteUser.mockResolvedValue(undefined);
  });

  it('shows the loading state before the user list arrives', async () => {
    let resolveList!: (value: User[]) => void;
    h.listUsers.mockImplementationOnce(
      () => new Promise<User[]>((resolve) => (resolveList = resolve)),
    );

    renderPage();

    expect(await screen.findByText('Loading users…')).toBeInTheDocument();
    expect(h.listUsers).toHaveBeenCalledTimes(1);

    resolveList(USERS);
    await screen.findByText('Ada Lovelace');
  });

  it('renders users with initials, emails, and role selects', async () => {
    renderPage();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    // Emails render twice per row (desktop cell + mobile fallback), so scope to
    // the row and assert the email is present at least once.
    const adaRow = screen.getByText('Ada Lovelace').closest('tr') as HTMLElement;
    const graceRow = screen.getByText('Grace Hopper').closest('tr') as HTMLElement;
    expect(adaRow).toHaveTextContent('ada@example.com');
    expect(graceRow).toHaveTextContent('grace@example.com');
    expect(screen.getByLabelText('Role for Ada Lovelace')).toHaveValue('admin');
    expect(screen.getByLabelText('Role for Grace Hopper')).toHaveValue('rep');
  });

  it('tags the signed-in user with a "you" badge and disables self-editing', async () => {
    renderPage();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('you')).toBeInTheDocument();

    const editSelf = screen.getByRole('button', { name: 'Edit Ada Lovelace' });
    const deleteSelf = screen.getByRole('button', { name: 'Delete Ada Lovelace' });
    expect(editSelf).toBeDisabled();
    expect(deleteSelf).toBeDisabled();

    expect(screen.getByRole('button', { name: 'Edit Grace Hopper' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete Grace Hopper' })).toBeEnabled();
  });

  it('renders the empty state when there are no users', async () => {
    h.listUsers.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('No users yet')).toBeInTheDocument();
  });

  it('shows an error banner when loading fails', async () => {
    h.listUsers.mockRejectedValue(new Error('Server down'));

    renderPage();

    expect(await screen.findByText('Server down')).toBeInTheDocument();
  });

  it('falls back to a generic message for non-Error load failures', async () => {
    h.listUsers.mockRejectedValue('not-an-error');

    renderPage();

    expect(await screen.findByText('Failed to load users')).toBeInTheDocument();
  });

  it('updates a role through the row select, toasts, and refreshes meta', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.selectOptions(screen.getByLabelText('Role for Grace Hopper'), 'manager');

    await waitFor(() => expect(h.updateUser).toHaveBeenCalledWith('u2', { role: 'manager' }));
    expect(h.show).toHaveBeenCalledWith('Grace Hopper is now manager', 'success');
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Role for Grace Hopper')).toHaveValue('manager');
  });

  it('toasts the server message when a role update fails', async () => {
    const user = userEvent.setup();
    h.updateUser.mockRejectedValueOnce(new Error('Role change denied'));
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.selectOptions(screen.getByLabelText('Role for Grace Hopper'), 'admin');

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Role change denied', 'error'));
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('creates a user, confirms the invitation and reloads the list', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: /New user/ }));

    const dialog = await screen.findByRole('dialog', { name: 'New user' });
    await user.type(within(dialog).getByLabelText(/Full name/), 'Linus Torvalds');
    await user.type(within(dialog).getByLabelText(/^Email/), 'linus@example.com');
    await user.selectOptions(within(dialog).getByLabelText(/^Role/), 'manager');
    await user.click(within(dialog).getByRole('button', { name: 'Create user & send invite' }));

    await waitFor(() =>
      expect(h.createUser).toHaveBeenCalledWith({
        name: 'Linus Torvalds',
        email: 'linus@example.com',
        role: 'manager',
      }),
    );
    // The success step confirms the invitation via a live region...
    expect(h.show).toHaveBeenCalledWith('Invitation sent to new@example.com', 'success');
    expect(h.refresh).toHaveBeenCalled();
    expect(h.listUsers).toHaveBeenCalledTimes(2);
    const success = await screen.findByRole('dialog', { name: 'User created' });
    expect(within(success).getByText(/An invitation has been sent to/)).toBeInTheDocument();
    expect(within(success).getByText('new@example.com')).toBeInTheDocument();
    // ...and no temporary password is exposed when delivery succeeded.
    expect(within(success).queryByText('Temporary password')).not.toBeInTheDocument();

    await user.click(within(success).getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'User created' })).not.toBeInTheDocument(),
    );
  });

  it('shows the one-time temporary password when the invitation cannot be emailed', async () => {
    const user = userEvent.setup();
    h.createUser.mockResolvedValueOnce({
      user: { ...USERS[1], id: 'u9' },
      inviteSent: false,
      tempPassword: 'one-time-secret-42',
    });
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: /New user/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New user' });
    await user.type(within(dialog).getByLabelText(/Full name/), 'Linus Torvalds');
    await user.type(within(dialog).getByLabelText(/^Email/), 'linus@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Create user & send invite' }));

    const success = await screen.findByRole('dialog', { name: 'User created' });
    expect(within(success).getByText(/Email delivery is unavailable/)).toBeInTheDocument();
    const secretInput = within(success).getByLabelText('Temporary password');
    expect(secretInput).toHaveValue('one-time-secret-42');
    expect(secretInput).toHaveAttribute('readonly');
    expect(
      within(success).getByRole('button', { name: 'Copy temporary password' }),
    ).toBeInTheDocument();
    expect(h.show).toHaveBeenCalledWith('User created — email delivery unavailable', 'info');
  });

  it('maps server validation details onto the create form fields', async () => {
    const user = userEvent.setup();
    h.createUser.mockRejectedValueOnce(
      new ApiError('validation', 'Invalid input', [
        { field: 'email', message: 'Email is already in use' },
      ]),
    );
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: /New user/ }));

    const dialog = await screen.findByRole('dialog', { name: 'New user' });
    await user.type(within(dialog).getByLabelText(/Full name/), 'Grace');
    await user.type(within(dialog).getByLabelText(/^Email/), 'grace@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Create user & send invite' }));

    expect(await screen.findByText('Email is already in use')).toBeInTheDocument();
    expect(h.show).not.toHaveBeenCalledWith('User created', 'success');
    // The modal stays open so the user can correct the field.
    expect(screen.getByRole('dialog', { name: 'New user' })).toBeInTheDocument();
  });

  it('toasts a generic error when a create fails outside validation', async () => {
    const user = userEvent.setup();
    h.createUser.mockRejectedValueOnce(new Error('Name too long'));
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: /New user/ }));

    const dialog = await screen.findByRole('dialog', { name: 'New user' });
    await user.type(within(dialog).getByLabelText(/Full name/), 'Grace');
    await user.type(within(dialog).getByLabelText(/^Email/), 'grace@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Create user & send invite' }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Name too long', 'error'));
  });

  it('falls back to a generic message for non-Error create failures', async () => {
    const user = userEvent.setup();
    h.createUser.mockRejectedValueOnce('boom');
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: /New user/ }));

    const dialog = await screen.findByRole('dialog', { name: 'New user' });
    await user.type(within(dialog).getByLabelText(/Full name/), 'Grace');
    await user.type(within(dialog).getByLabelText(/^Email/), 'grace@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Create user & send invite' }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Save failed', 'error'));
  });

  it('prefills and saves the edit form', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: 'Edit Ben Smith' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit user' });
    expect(within(dialog).getByLabelText(/Full name/)).toHaveValue('Ben Smith');
    expect(within(dialog).getByLabelText(/^Email/)).toHaveValue('ben@example.com');
    expect(within(dialog).getByLabelText(/^Role/)).toHaveValue('rep');

    const name = within(dialog).getByLabelText(/Full name/);
    await user.clear(name);
    await user.type(name, 'Ben S.');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(h.updateUser).toHaveBeenCalledWith('u3', {
        name: 'Ben S.',
        email: 'ben@example.com',
        role: 'rep',
      }),
    );
    expect(h.show).toHaveBeenCalledWith('User updated', 'success');
    expect(h.refresh).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit user' })).not.toBeInTheDocument(),
    );
  });

  it('deletes a user after confirmation and removes the row', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: 'Delete Grace Hopper' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete user' });
    expect(dialog).toHaveTextContent(
      'Delete Grace Hopper? Their account will no longer be able to sign in.',
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(h.deleteUser).toHaveBeenCalledWith('u2'));
    expect(h.show).toHaveBeenCalledWith('Grace Hopper removed', 'success');
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('keeps the user when deletion is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: 'Delete Grace Hopper' }));
    await screen.findByRole('dialog', { name: 'Delete user' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(h.deleteUser).not.toHaveBeenCalled();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('toasts the server message when a deletion fails', async () => {
    const user = userEvent.setup();
    h.deleteUser.mockRejectedValueOnce(new Error('Cannot delete yourself'));
    renderPage();
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: 'Delete Grace Hopper' }));
    await screen.findByRole('dialog', { name: 'Delete user' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Cannot delete yourself', 'error'));
    expect(h.refresh).not.toHaveBeenCalled();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });
});
