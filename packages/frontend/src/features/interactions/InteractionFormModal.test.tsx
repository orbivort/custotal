// Component tests for InteractionFormModal (FR-IT-04).
//
// External collaborators are mocked so the tests focus on modal behavior:
// - interactionsApi.updateInteraction -> save payload + outcome (incl. 409s)
// - MetaContext.useMeta               -> responsible-user options
//
// The real Modal is used (it portals into document.body, which jsdom supports),
// so dialog affordances such as the header close button are covered too.
// `lib/hooks`.useMutation stays real so loading/error states are genuine.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime } from '../../lib/format';
import type { Interaction, InteractionType, User } from '../../types/domain';
import { InteractionFormModal } from './InteractionFormModal';

const h = vi.hoisted(() => ({
  updateInteraction: vi.fn(),
  useMeta: vi.fn(),
}));

vi.mock('./interactionsApi', () => ({ updateInteraction: h.updateInteraction }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

const onClose = vi.fn();
const onSaved = vi.fn();

function makeInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: 'i1',
    type: 'call',
    dateTime: '2026-03-04T15:30:00.000Z',
    channel: 'phone',
    direction: 'inbound',
    summary: 'Discussed renewal terms',
    contactId: 'c1',
    accountId: 'a1',
    responsibleUserId: 'u2',
    createdAt: '2026-03-01T08:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-03-05T09:00:00.000Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

/** Mirrors the component's ISO -> datetime-local conversion (local time). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const summaryLabel = () => screen.getByLabelText(/^Summary \(originally logged/);

function renderModal(interaction: Interaction = makeInteraction()) {
  return render(
    <InteractionFormModal interaction={interaction} onClose={onClose} onSaved={onSaved} />,
  );
}

describe('InteractionFormModal', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({ users: USERS, userName: (id?: string) => id ?? 'Unknown' });
    h.updateInteraction.mockResolvedValue(makeInteraction());
  });

  describe('initial values', () => {
    it('prefills every editable field from the interaction', () => {
      const interaction = makeInteraction();
      renderModal(interaction);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('Type')).toHaveValue('call');
      expect(screen.getByLabelText('Direction')).toHaveValue('inbound');
      expect(screen.getByLabelText('Date & time')).toHaveValue(toLocalInput(interaction.dateTime));
      expect(summaryLabel()).toHaveValue('Discussed renewal terms');
      expect(screen.getByLabelText('Responsible user')).toHaveValue('u2');
    });

    it('defaults the direction to outbound when the interaction has none', () => {
      renderModal(makeInteraction({ direction: undefined }));

      expect(screen.getByLabelText('Direction')).toHaveValue('outbound');
    });

    it('shows the original logging timestamp in the summary label', () => {
      const interaction = makeInteraction();
      renderModal(interaction);

      expect(
        screen.getByText(`Summary (originally logged ${formatDateTime(interaction.createdAt)})`),
      ).toBeInTheDocument();
    });

    it('lists every meta user as a responsible-user option', () => {
      renderModal();

      expect(screen.getByLabelText('Responsible user').querySelectorAll('option')).toHaveLength(2);
      expect(screen.getByRole('option', { name: 'Ada Lovelace' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Ben Smith' })).toBeInTheDocument();
    });

    it('hides the direction field once the type is a note', () => {
      renderModal();

      expect(screen.getByLabelText('Direction')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'note' } });

      expect(screen.queryByLabelText('Direction')).not.toBeInTheDocument();
    });
  });

  describe('save button enablement', () => {
    it('is disabled while the summary is blank', () => {
      renderModal();

      fireEvent.change(summaryLabel(), { target: { value: '   ' } });

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });

    it('is enabled with a non-empty summary', () => {
      renderModal();

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    });
  });

  describe('submission', () => {
    it('patches the interaction with the edited fields and the lock token', async () => {
      const user = userEvent.setup();
      const interaction = makeInteraction();
      renderModal(interaction);

      await user.selectOptions(screen.getByLabelText('Type'), 'meeting');
      await user.selectOptions(screen.getByLabelText('Direction'), 'outbound');
      await user.selectOptions(screen.getByLabelText('Responsible user'), 'u1');
      fireEvent.change(screen.getByLabelText('Date & time'), {
        target: { value: '2026-05-06T14:45' },
      });
      fireEvent.change(summaryLabel(), { target: { value: '  Rescheduled the demo  ' } });

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(h.updateInteraction).toHaveBeenCalledWith('i1', {
          type: 'meeting',
          contactId: 'c1',
          summary: 'Rescheduled the demo',
          responsibleUserId: 'u1',
          updatedAt: '2026-03-05T09:00:00.000Z',
          direction: 'outbound',
          dateTime: new Date('2026-05-06T14:45').toISOString(),
        }),
      );
    });

    it('keeps the untouched values when saving without edits', async () => {
      const user = userEvent.setup();
      const interaction = makeInteraction();
      renderModal(interaction);

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(h.updateInteraction).toHaveBeenCalledWith('i1', {
          type: 'call',
          contactId: 'c1',
          summary: 'Discussed renewal terms',
          responsibleUserId: 'u2',
          updatedAt: '2026-03-05T09:00:00.000Z',
          direction: 'inbound',
          dateTime: new Date(toLocalInput(interaction.dateTime)).toISOString(),
        }),
      );
    });

    it('omits direction when the type is a note', async () => {
      const user = userEvent.setup();
      renderModal();

      fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'note' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(h.updateInteraction).toHaveBeenCalledWith(
          'i1',
          expect.objectContaining({ type: 'note' }),
        ),
      );
      expect(h.updateInteraction.mock.calls[0][1]).not.toHaveProperty('direction');
    });

    it('omits dateTime when the local input cannot be parsed', async () => {
      const user = userEvent.setup();
      renderModal();

      fireEvent.change(screen.getByLabelText('Date & time'), { target: { value: '' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(h.updateInteraction).toHaveBeenCalled());
      expect(h.updateInteraction.mock.calls[0][1]).not.toHaveProperty('dateTime');
    });

    it('calls onSaved then onClose after a successful save', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      expect(onClose).toHaveBeenCalledTimes(1);
      // onSaved must run before onClose so the parent can refetch first.
      expect(onSaved.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
    });

    it('disables the save button and shows a saving label while in flight', async () => {
      const user = userEvent.setup();
      let resolveUpdate!: (value: Interaction) => void;
      h.updateInteraction.mockImplementationOnce(
        () => new Promise<Interaction>((resolve) => (resolveUpdate = resolve)),
      );
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

      resolveUpdate(makeInteraction());

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    });

    it('surfaces a 409 conflict in the error banner and keeps the modal open', async () => {
      const user = userEvent.setup();
      h.updateInteraction.mockRejectedValueOnce(
        new Error('The record changed since you loaded it.'),
      );
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(
        await screen.findByText('The record changed since you loaded it.'),
      ).toBeInTheDocument();
      expect(onSaved).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('falls back to a generic message for non-Error failures', async () => {
      const user = userEvent.setup();
      h.updateInteraction.mockRejectedValueOnce('nope');
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByText('Request failed')).toBeInTheDocument();
    });

    it('clears the previous error once a retry succeeds', async () => {
      const user = userEvent.setup();
      h.updateInteraction.mockRejectedValueOnce(new Error('Conflict on first try'));
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await screen.findByText('Conflict on first try');

      h.updateInteraction.mockResolvedValue(makeInteraction());
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });
  });

  describe('dismissal', () => {
    it('closes from the Cancel button without saving', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(h.updateInteraction).not.toHaveBeenCalled();
    });

    it('closes from the dialog close control and on Escape', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Close' }));
      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(2);
      expect(h.updateInteraction).not.toHaveBeenCalled();
    });
  });

  describe('type coverage', () => {
    it('offers every interaction type as an option', () => {
      renderModal();

      const types = (['call', 'email', 'meeting', 'note', 'other'] as InteractionType[]).map(
        (t) => t[0].toUpperCase() + t.slice(1),
      );
      expect(screen.getByLabelText('Type').querySelectorAll('option')).toHaveLength(5);
      for (const type of types) {
        expect(screen.getByRole('option', { name: type })).toBeInTheDocument();
      }
    });
  });
});
