// Component tests for QuickLogForm.
//
// External collaborators are mocked so the tests focus on form behavior:
// - interactionsApi.createInteraction -> submission payload + outcome
// - toast.useToast                    -> success / error feedback
// - SessionContext.useSession         -> current user (RBAC via real canWrite)
//
// `lib/rbac`.canWrite is intentionally left real so the read-only/none gating
// is exercised rather than assumed.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interaction, User } from '../../types/domain';
import { QuickLogForm } from './QuickLogForm';

const h = vi.hoisted(() => ({
  createInteraction: vi.fn(),
  useSession: vi.fn(),
  show: vi.fn(),
}));

vi.mock('./interactionsApi', () => ({ createInteraction: h.createInteraction }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

const ADMIN: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };
const REP: User = { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' };
const READONLY: User = { id: 'u3', name: 'Rea Donly', email: 'rea@example.com', role: 'readonly' };

const CREATED: Interaction = {
  id: 'i1',
  type: 'call',
  dateTime: '2026-03-04T10:30:00.000Z',
  direction: 'inbound',
  summary: 'Discussed renewal',
  contactId: 'c1',
  responsibleUserId: 'u2',
  createdAt: '2026-03-04T10:30:00.000Z',
  createdBy: 'u2',
  updatedAt: '2026-03-04T10:30:00.000Z',
  updatedBy: 'u2',
};

const CONTACTS = [
  { id: 'c1', name: 'Ada Lovelace' },
  { id: 'c2', name: 'Grace Hopper' },
];

const onSaved = vi.fn();

function renderForm(
  props: {
    contactId?: string;
    accountId?: string;
    opportunityId?: string;
    contacts?: { id: string; name: string }[];
  } = {},
) {
  return render(
    <QuickLogForm
      contactId={props.contactId}
      accountId={props.accountId}
      opportunityId={props.opportunityId}
      contacts={props.contacts}
      onSaved={onSaved}
    />,
  );
}

describe('QuickLogForm', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useSession.mockReturnValue({ user: REP });
    h.createInteraction.mockResolvedValue(CREATED);
  });

  describe('write access gating', () => {
    it('renders nothing for a read-only user', () => {
      h.useSession.mockReturnValue({ user: READONLY });

      const { container } = renderForm({ contactId: 'c1' });

      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when there is no session user', () => {
      h.useSession.mockReturnValue({ user: null });

      const { container } = renderForm({ contactId: 'c1' });

      expect(container).toBeEmptyDOMElement();
    });

    it('renders the form for a rep', () => {
      renderForm({ contactId: 'c1' });

      expect(screen.getByText('Log an interaction')).toBeInTheDocument();
    });
  });

  describe('initial state', () => {
    it('defaults to an inbound call with a disabled submit button', () => {
      renderForm({ contactId: 'c1' });

      expect(screen.getByLabelText('Type')).toHaveValue('call');
      expect(screen.getByLabelText('Direction')).toHaveValue('inbound');
      expect(screen.getByLabelText('Summary')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Save interaction' })).toBeDisabled();
    });

    it('shows the logged-by hint with the current user name', () => {
      h.useSession.mockReturnValue({ user: ADMIN });

      renderForm({ contactId: 'c1' });

      expect(screen.getByText(/Logged by Ada Lovelace/)).toBeInTheDocument();
    });

    it('renders a contact picker only when a contact list is supplied', () => {
      const { unmount } = renderForm({ contactId: 'c1' });
      expect(screen.queryByLabelText('Contact')).not.toBeInTheDocument();
      unmount();

      renderForm({ contacts: CONTACTS });
      expect(screen.getByLabelText('Contact')).toBeInTheDocument();
    });

    it('pre-selects the supplied contact id when a contact list is present', () => {
      renderForm({ contactId: 'c2', contacts: CONTACTS });

      expect(screen.getByLabelText('Contact')).toHaveValue('c2');
    });
  });

  describe('submit enablement', () => {
    it('keeps the submit button disabled for a whitespace-only summary', () => {
      renderForm({ contactId: 'c1' });

      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: '   ' } });

      expect(screen.getByRole('button', { name: 'Save interaction' })).toBeDisabled();
    });

    it('enables submit once a summary is typed', () => {
      renderForm({ contactId: 'c1' });

      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Called Ada' } });

      expect(screen.getByRole('button', { name: 'Save interaction' })).toBeEnabled();
    });

    it('keeps submit disabled until a contact is chosen from the list', () => {
      renderForm({ contacts: CONTACTS });

      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Called Ada' } });
      expect(screen.getByRole('button', { name: 'Save interaction' })).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Contact'), { target: { value: 'c2' } });

      expect(screen.getByRole('button', { name: 'Save interaction' })).toBeEnabled();
    });

    it('keeps submit disabled with no contact when neither prop is provided', () => {
      renderForm();

      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Called Ada' } });

      expect(screen.getByRole('button', { name: 'Save interaction' })).toBeDisabled();
    });
  });

  describe('direction visibility', () => {
    it('hides the direction field for notes', () => {
      renderForm({ contactId: 'c1' });

      expect(screen.getByLabelText('Direction')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'note' } });

      expect(screen.queryByLabelText('Direction')).not.toBeInTheDocument();
    });
  });

  describe('submission', () => {
    it('posts the trimmed summary with type, direction, scope and responsible user', async () => {
      const user = userEvent.setup();
      renderForm({ contactId: 'c1', accountId: 'a1', opportunityId: 'o1' });

      await user.selectOptions(screen.getByLabelText('Type'), 'email');
      await user.selectOptions(screen.getByLabelText('Direction'), 'outbound');
      fireEvent.change(screen.getByLabelText('Summary'), {
        target: { value: '  Sent the proposal  ' },
      });
      await user.click(screen.getByRole('button', { name: 'Save interaction' }));

      await waitFor(() =>
        expect(h.createInteraction).toHaveBeenCalledWith({
          type: 'email',
          direction: 'outbound',
          summary: 'Sent the proposal',
          contactId: 'c1',
          accountId: 'a1',
          opportunityId: 'o1',
          responsibleUserId: 'u2',
        }),
      );
    });

    it('omits direction when the type is a note', async () => {
      const user = userEvent.setup();
      renderForm({ contactId: 'c1' });

      await user.selectOptions(screen.getByLabelText('Type'), 'note');
      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Left a note' } });
      await user.click(screen.getByRole('button', { name: 'Save interaction' }));

      await waitFor(() =>
        expect(h.createInteraction).toHaveBeenCalledWith({
          type: 'note',
          direction: undefined,
          summary: 'Left a note',
          contactId: 'c1',
          accountId: undefined,
          opportunityId: undefined,
          responsibleUserId: 'u2',
        }),
      );
    });

    it('uses the contact selected from the list', async () => {
      const user = userEvent.setup();
      renderForm({ contacts: CONTACTS });

      await user.selectOptions(screen.getByLabelText('Contact'), 'c2');
      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Called Grace' } });
      await user.click(screen.getByRole('button', { name: 'Save interaction' }));

      await waitFor(() =>
        expect(h.createInteraction).toHaveBeenCalledWith(
          expect.objectContaining({ contactId: 'c2', summary: 'Called Grace' }),
        ),
      );
    });

    it('clears the summary, toasts success and calls onSaved', async () => {
      const user = userEvent.setup();
      renderForm({ contactId: 'c1' });

      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Called Ada' } });
      await user.click(screen.getByRole('button', { name: 'Save interaction' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Interaction logged', 'success'));
      expect(screen.getByLabelText('Summary')).toHaveValue('');
      expect(onSaved).toHaveBeenCalledTimes(1);
      // The submit button re-disables because the summary was reset.
      expect(screen.getByRole('button', { name: 'Save interaction' })).toBeDisabled();
    });

    it('disables the submit button and shows a saving label while in flight', async () => {
      const user = userEvent.setup();
      let resolveCreate!: (value: Interaction) => void;
      h.createInteraction.mockImplementationOnce(
        () => new Promise<Interaction>((resolve) => (resolveCreate = resolve)),
      );
      renderForm({ contactId: 'c1' });

      await user.type(screen.getByLabelText('Summary'), 'Called Ada');
      const submit = screen.getByRole('button', { name: 'Save interaction' });
      await user.click(submit);

      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

      resolveCreate(CREATED);

      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      // Back to the idle label; it is disabled again because a successful save
      // clears the summary.
      expect(screen.queryByRole('button', { name: 'Saving…' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save interaction' })).toBeDisabled();
    });

    it('surfaces the server message when logging fails', async () => {
      const user = userEvent.setup();
      h.createInteraction.mockRejectedValueOnce(new Error('Contact not found'));
      renderForm({ contactId: 'c1' });

      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Called Ada' } });
      await user.click(screen.getByRole('button', { name: 'Save interaction' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Contact not found', 'error'));
      // The summary is preserved so the user can retry without retyping.
      expect(screen.getByLabelText('Summary')).toHaveValue('Called Ada');
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('falls back to a generic message for non-Error failures', async () => {
      const user = userEvent.setup();
      h.createInteraction.mockRejectedValueOnce('boom');
      renderForm({ contactId: 'c1' });

      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Called Ada' } });
      await user.click(screen.getByRole('button', { name: 'Save interaction' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Failed to log', 'error'));
    });

    it('does not call the API when the form is submitted without a contact', () => {
      const { container } = renderForm({ contacts: CONTACTS });

      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Called someone' } });
      fireEvent.submit(container.querySelector('form') as HTMLFormElement);

      expect(h.createInteraction).not.toHaveBeenCalled();
      expect(h.show).not.toHaveBeenCalled();
    });
  });
});
