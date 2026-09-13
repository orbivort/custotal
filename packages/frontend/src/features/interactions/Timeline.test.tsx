// Component tests for Timeline.
//
// External collaborators are mocked so the tests focus on timeline behavior:
// - interactionsApi.listInteractions   -> pages of interactions
// - interactionsApi.deleteInteraction  -> delete outcome
// - toast.useToast                     -> success / error feedback
// - MetaContext.useMeta                -> responsible user name resolution
// - SessionContext.useSession          -> RBAC (canWrite stays real)
// - InteractionFormModal               -> stubbed child, so its own network
//   calls stay out of these tests while its wiring is still asserted
//
// `lib/hooks`.useQuery stays real so loading/pagination/refetch transitions are
// exercised as they happen in the app.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime } from '../../lib/format';
import type { Interaction, InteractionType, PaginatedResult, User } from '../../types/domain';
import type { InteractionListParams } from './interactionsApi';
import { Timeline } from './Timeline';

const h = vi.hoisted(() => ({
  listInteractions: vi.fn(),
  deleteInteraction: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  show: vi.fn(),
}));

vi.mock('./interactionsApi', () => ({
  listInteractions: h.listInteractions,
  deleteInteraction: h.deleteInteraction,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

vi.mock('./InteractionFormModal', () => ({
  InteractionFormModal: ({
    interaction,
    onClose,
    onSaved,
  }: {
    interaction: Interaction;
    onClose: () => void;
    onSaved: () => void;
  }) => (
    <div data-testid="edit-modal">
      <span data-testid="edit-modal-id">{interaction.id}</span>
      <button onClick={onSaved}>stub-modal-saved</button>
      <button onClick={onClose}>stub-modal-close</button>
    </div>
  ),
}));

const ADMIN: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };
const MANAGER: User = { id: 'u4', name: 'Mo Nager', email: 'mo@example.com', role: 'manager' };
const REP: User = { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' };
const READONLY: User = { id: 'u3', name: 'Rea Donly', email: 'rea@example.com', role: 'readonly' };

const USER_NAMES: Record<string, string> = { u1: 'Ada Lovelace', u2: 'Ben Smith', u4: 'Mo Nager' };

function makeInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: 'i1',
    type: 'call',
    dateTime: '2026-03-04T15:30:00.000Z',
    direction: 'outbound',
    summary: 'Discussed renewal terms',
    contactId: 'c1',
    responsibleUserId: 'u1',
    createdAt: '2026-03-04T15:30:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-03-04T15:30:00.000Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

const I1 = makeInteraction({ id: 'i1', summary: 'First touchpoint', type: 'call' });
const I2 = makeInteraction({
  id: 'i2',
  summary: 'Second touchpoint',
  type: 'email',
  direction: 'inbound',
  dateTime: '2026-03-05T09:15:00.000Z',
});
const I3 = makeInteraction({ id: 'i3', summary: 'Third touchpoint', type: 'meeting' });
const I4 = makeInteraction({
  id: 'i4',
  summary: 'Fourth touchpoint',
  type: 'note',
  direction: undefined,
});

/**
 * Answers page N with `pages[N-1]` and a total derived from every page, so
 * `hasMore` only stays true while pages remain.
 */
function mockPages(pages: Interaction[][]) {
  const total = pages.flat().length;
  h.listInteractions.mockImplementation(async (params: InteractionListParams) => {
    const page = params.page ?? 1;
    const items = pages[page - 1] ?? [];
    const result: PaginatedResult<Interaction> = { items, total, page, pageSize: 20 };
    return result;
  });
}

/**
 * Flushes React's pending passive effects. `hasMore` is derived in an effect,
 * so a bare `findByText` can resolve before the timeline decided whether more
 * pages exist.
 */
async function settle() {
  await act(async () => undefined);
}

function renderTimeline(
  props: { contactId?: string; accountId?: string; opportunityId?: string } = {},
) {
  return render(
    <Timeline
      contactId={props.contactId}
      accountId={props.accountId}
      opportunityId={props.opportunityId}
    />,
  );
}

describe('Timeline', () => {
  // Vitest globals are disabled, so RTL's automatic cleanup does not run.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useSession.mockReturnValue({ user: ADMIN });
    h.useMeta.mockReturnValue({
      users: [],
      userName: (id?: string) => (id ? (USER_NAMES[id] ?? 'Unknown') : 'Unknown'),
    });
    h.deleteInteraction.mockResolvedValue(undefined);
    mockPages([[I1, I2]]);
  });

  describe('loading and empty states', () => {
    it('shows the loading block until the first page resolves', async () => {
      let resolveList!: (value: PaginatedResult<Interaction>) => void;
      h.listInteractions.mockImplementationOnce(
        () => new Promise<PaginatedResult<Interaction>>((resolve) => (resolveList = resolve)),
      );

      renderTimeline({ contactId: 'c1' });

      expect(screen.getByText('Loading timeline…')).toBeInTheDocument();

      resolveList({ items: [I1], total: 1, page: 1, pageSize: 20 });

      expect(await screen.findByText('First touchpoint')).toBeInTheDocument();
      expect(screen.queryByText('Loading timeline…')).not.toBeInTheDocument();
    });

    it('shows the empty state when there are no interactions', async () => {
      mockPages([[]]);

      renderTimeline({ contactId: 'c1' });

      expect(await screen.findByText('No interactions yet')).toBeInTheDocument();
      expect(
        screen.getByText('Log your first touchpoint to build the history.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    });

    it('requests the first page with the active scope and page size 20', async () => {
      renderTimeline({ contactId: 'c1', accountId: 'a1', opportunityId: 'o1' });

      await screen.findByText('First touchpoint');

      const params = h.listInteractions.mock.calls[0][0] as InteractionListParams;
      expect(params).toMatchObject({
        contactId: 'c1',
        accountId: 'a1',
        opportunityId: 'o1',
        pageSize: 20,
      });
      // Page 1 is implicit: sending `page=1` would be redundant query noise.
      expect(params).not.toHaveProperty('page');
    });
  });

  describe('rendering entries', () => {
    it('lists every interaction with type, direction, timestamp, owner and summary', async () => {
      renderTimeline({ contactId: 'c1' });

      await screen.findByText('First touchpoint');

      expect(screen.getByText('Second touchpoint')).toBeInTheDocument();
      expect(screen.getByText('Call')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Outbound')).toBeInTheDocument();
      expect(screen.getByText('Inbound')).toBeInTheDocument();
      expect(screen.getByText(formatDateTime(I1.dateTime))).toBeInTheDocument();
      expect(screen.getByText(formatDateTime(I2.dateTime))).toBeInTheDocument();
      // Both entries share the same owner, hence getAllByText.
      expect(screen.getAllByText('· Ada Lovelace')).toHaveLength(2);
    });

    it('omits the direction label when an entry has no direction', async () => {
      mockPages([[I4]]);

      renderTimeline({ contactId: 'c1' });

      await screen.findByText('Fourth touchpoint');
      expect(screen.queryByText('Inbound')).not.toBeInTheDocument();
      expect(screen.queryByText('Outbound')).not.toBeInTheDocument();
    });

    it('falls back to the Other badge for an unrecognised type', async () => {
      const unknown = makeInteraction({
        id: 'i9',
        summary: 'Carrier pigeon',
        type: 'carrier-pigeon' as InteractionType,
      });
      mockPages([[unknown]]);

      renderTimeline({ contactId: 'c1' });

      await screen.findByText('Carrier pigeon');
      expect(screen.getByText('Other')).toBeInTheDocument();
    });
  });

  describe('mutation permissions', () => {
    it('lets an admin edit and delete any entry', async () => {
      h.useSession.mockReturnValue({ user: ADMIN });
      mockPages([[I1]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      expect(screen.getByRole('button', { name: 'Edit interaction' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete interaction' })).toBeInTheDocument();
    });

    it('lets a manager edit and delete any entry', async () => {
      h.useSession.mockReturnValue({ user: MANAGER });
      mockPages([[I1]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      expect(screen.getByRole('button', { name: 'Edit interaction' })).toBeInTheDocument();
    });

    it('hides both actions from a read-only user', async () => {
      h.useSession.mockReturnValue({ user: READONLY });
      mockPages([[I1]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      expect(screen.queryByRole('button', { name: 'Edit interaction' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete interaction' })).not.toBeInTheDocument();
    });

    it('hides both actions when there is no session user', async () => {
      h.useSession.mockReturnValue({ user: null });
      mockPages([[I1]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      expect(screen.queryByRole('button', { name: 'Edit interaction' })).not.toBeInTheDocument();
    });

    it('lets a rep edit entries they created', async () => {
      h.useSession.mockReturnValue({ user: REP });
      mockPages([
        [
          makeInteraction({
            id: 'i5',
            summary: 'Rep authored',
            createdBy: 'u2',
            responsibleUserId: 'u1',
          }),
        ],
      ]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('Rep authored');

      expect(screen.getByRole('button', { name: 'Edit interaction' })).toBeInTheDocument();
    });

    it('lets a rep edit entries they are responsible for', async () => {
      h.useSession.mockReturnValue({ user: REP });
      mockPages([
        [
          makeInteraction({
            id: 'i6',
            summary: 'Rep owned',
            createdBy: 'u1',
            responsibleUserId: 'u2',
          }),
        ],
      ]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('Rep owned');

      expect(screen.getByRole('button', { name: 'Edit interaction' })).toBeInTheDocument();
    });

    it("hides the actions from a rep for somebody else's entry", async () => {
      h.useSession.mockReturnValue({ user: REP });
      mockPages([[I1]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      expect(screen.queryByRole('button', { name: 'Edit interaction' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete interaction' })).not.toBeInTheDocument();
    });
  });

  describe('pagination', () => {
    it('hides the load-more button when the first page already covers the total', async () => {
      renderTimeline({ contactId: 'c1' });

      await screen.findByText('First touchpoint');
      await settle();

      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    });

    it('appends the next page and retires the button once everything is loaded', async () => {
      const user = userEvent.setup();
      mockPages([
        [I1, I2],
        [I3, I4],
      ]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      const loadMore = await screen.findByRole('button', { name: 'Load more' });
      await user.click(loadMore);

      expect(await screen.findByText('Third touchpoint')).toBeInTheDocument();
      expect(screen.getByText('Fourth touchpoint')).toBeInTheDocument();
      // Earlier entries stay visible: pages accumulate, they are not replaced.
      expect(screen.getByText('First touchpoint')).toBeInTheDocument();

      const params = h.listInteractions.mock.calls[1][0] as InteractionListParams;
      expect(params).toMatchObject({ contactId: 'c1', page: 2, pageSize: 20 });

      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument(),
      );
    });

    it('walks through several pages, incrementing the requested page each time', async () => {
      const user = userEvent.setup();
      const I5 = makeInteraction({ id: 'i5', summary: 'Fifth touchpoint' });
      const I6 = makeInteraction({ id: 'i6', summary: 'Sixth touchpoint' });
      mockPages([
        [I1, I2],
        [I3, I4],
        [I5, I6],
      ]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      await user.click(await screen.findByRole('button', { name: 'Load more' }));
      await screen.findByText('Third touchpoint');

      await user.click(await screen.findByRole('button', { name: 'Load more' }));
      await screen.findByText('Fifth touchpoint');

      expect(screen.getByText('Sixth touchpoint')).toBeInTheDocument();
      expect((h.listInteractions.mock.calls[2][0] as InteractionListParams).page).toBe(3);
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    });

    it('disables the button and shows a loading label while the next page is in flight', async () => {
      const user = userEvent.setup();
      let resolvePage2!: (value: PaginatedResult<Interaction>) => void;
      // Only page 2 is held open; page 1 must still resolve for `hasMore`.
      h.listInteractions.mockImplementation(async (p: InteractionListParams) => {
        if ((p.page ?? 1) === 2) {
          return new Promise<PaginatedResult<Interaction>>((resolve) => (resolvePage2 = resolve));
        }
        return { items: [I1, I2], total: 4, page: 1, pageSize: 20 };
      });

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      const loadMore = await screen.findByRole('button', { name: 'Load more' });
      await user.click(loadMore);

      // Queried through the element rather than by name: the inline Spinner
      // contributes an aria-label, so the accessible name is not just "Loading…".
      expect(loadMore).toBeDisabled();
      expect(loadMore).toHaveTextContent('Loading…');

      resolvePage2({ items: [I3, I4], total: 4, page: 2, pageSize: 20 });

      expect(await screen.findByText('Third touchpoint')).toBeInTheDocument();
    });

    it('surfaces the failure message when loading more fails', async () => {
      const user = userEvent.setup();
      // Page 1 still resolves so the button appears; page 2 is the one that fails.
      h.listInteractions.mockImplementation(async (p: InteractionListParams) => {
        if ((p.page ?? 1) >= 2) throw new Error('Rate limited');
        return { items: [I1, I2], total: 4, page: 1, pageSize: 20 };
      });

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      await user.click(await screen.findByRole('button', { name: 'Load more' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Rate limited', 'error'));
      // The button recovers so the user can retry.
      expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();
    });

    it('falls back to a generic message for non-Error pagination failures', async () => {
      const user = userEvent.setup();
      h.listInteractions.mockImplementation(async (p: InteractionListParams) => {
        if ((p.page ?? 1) >= 2) return Promise.reject('nope');
        return { items: [I1, I2], total: 4, page: 1, pageSize: 20 };
      });

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      await user.click(await screen.findByRole('button', { name: 'Load more' }));

      await waitFor(() =>
        expect(h.show).toHaveBeenCalledWith('Failed to load more interactions', 'error'),
      );
    });
  });

  describe('editing', () => {
    it('opens the edit modal for the clicked entry and closes it on request', async () => {
      const user = userEvent.setup();
      mockPages([[I1, I2]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      await user.click(screen.getAllByRole('button', { name: 'Edit interaction' })[1]);

      expect(screen.getByTestId('edit-modal-id')).toHaveTextContent('i2');

      await user.click(screen.getByRole('button', { name: 'stub-modal-close' }));

      expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument();
    });

    it('refetches the timeline after the modal reports a save', async () => {
      const user = userEvent.setup();
      mockPages([[I1]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');
      expect(h.listInteractions).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: 'Edit interaction' }));
      await user.click(screen.getByRole('button', { name: 'stub-modal-saved' }));

      await waitFor(() => expect(h.listInteractions).toHaveBeenCalledTimes(2));
    });
  });

  describe('deleting', () => {
    it('deletes the confirmed entry, toasts success and refetches', async () => {
      const user = userEvent.setup();
      mockPages([[I1, I2]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      await user.click(screen.getAllByRole('button', { name: 'Delete interaction' })[0]);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Delete interaction')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.deleteInteraction).toHaveBeenCalledWith('i1'));
      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Interaction deleted', 'success'));
      await waitFor(() => expect(h.listInteractions).toHaveBeenCalledTimes(2));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('keeps the entry when the confirmation is cancelled', async () => {
      const user = userEvent.setup();
      mockPages([[I1]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      await user.click(screen.getByRole('button', { name: 'Delete interaction' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(h.deleteInteraction).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('First touchpoint')).toBeInTheDocument();
    });

    it('surfaces the failure and keeps the dialog open when the delete fails', async () => {
      const user = userEvent.setup();
      h.deleteInteraction.mockRejectedValueOnce(new Error('Forbidden'));
      mockPages([[I1]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      await user.click(screen.getByRole('button', { name: 'Delete interaction' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Forbidden', 'error'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('falls back to a generic message for non-Error delete failures', async () => {
      const user = userEvent.setup();
      h.deleteInteraction.mockRejectedValueOnce('nope');
      mockPages([[I1]]);

      renderTimeline({ contactId: 'c1' });
      await screen.findByText('First touchpoint');

      await user.click(screen.getByRole('button', { name: 'Delete interaction' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Failed to delete', 'error'));
    });
  });
});
