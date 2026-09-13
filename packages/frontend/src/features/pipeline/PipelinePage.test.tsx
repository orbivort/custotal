// Component tests for PipelinePage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - opportunitiesApi            -> board data + stage moves
// - MetaContext.useMeta         -> stages, account/user/stage name resolution
// - SessionContext.useSession   -> RBAC for the owner filter
// - toast.useToast              -> move/export feedback
// - lib/csv                     -> download/toCsv interception (no Blob in jsdom)
// - OpportunityFormModal        -> stubbed child, so its own network calls stay
//   out of these tests while its wiring is still asserted
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCurrency, formatDate } from '../../lib/format';
import type { ListResult, Opportunity, Stage, User } from '../../types/domain';
import PipelinePage from './PipelinePage';

const h = vi.hoisted(() => ({
  listOpportunities: vi.fn(),
  moveOpportunityStage: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  show: vi.fn(),
  toCsv: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock('./opportunitiesApi', () => ({
  listOpportunities: h.listOpportunities,
  moveOpportunityStage: h.moveOpportunityStage,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));
vi.mock('../../lib/csv', () => ({ toCsv: h.toCsv, downloadCsv: h.downloadCsv }));

vi.mock('./OpportunityFormModal', () => ({
  OpportunityFormModal: ({
    open,
    opportunity,
    onSaved,
    onClose,
  }: {
    open: boolean;
    opportunity?: Opportunity | null;
    onSaved: () => void;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="opp-form">
        <span data-testid="opp-form-opp">{opportunity?.name ?? ''}</span>
        <button onClick={onSaved}>stub-form-saved</button>
        <button onClick={onClose}>stub-form-close</button>
      </div>
    ) : null,
}));

// Deliberately unsorted: the board must order columns by `order`, not arrival.
const STAGES: Stage[] = [
  { id: 's3', name: 'Won', order: 3, winProbability: 100, classification: 'won' },
  { id: 's1', name: 'Discovery', order: 1, winProbability: 10, classification: 'open' },
  { id: 's4', name: 'Lost', order: 4, winProbability: 0, classification: 'lost' },
  { id: 's2', name: 'Proposal', order: 2, winProbability: 40, classification: 'open' },
];

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

const ADMIN: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };
const REP: User = { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' };

const USER_NAMES: Record<string, string> = { u1: 'Ada Lovelace', u2: 'Ben Smith' };
const ACCOUNT_NAMES: Record<string, string> = { acc1: 'Acme Corp', acc2: 'Initech' };

function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'o1',
    name: 'Alpha deal',
    accountId: 'acc1',
    valueMinor: 150000,
    currency: 'USD',
    expectedCloseDate: '2026-06-30',
    stageId: 's1',
    probability: 10,
    probabilityManual: false,
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function listResult(items: Opportunity[]): ListResult<Opportunity> {
  return { items, total: items.length };
}

/** The two deals used by most tests: one in Discovery, one in Proposal. */
function defaultDeals(): Opportunity[] {
  return [
    makeOpp(),
    makeOpp({
      id: 'o2',
      name: 'Beta deal',
      accountId: 'acc2',
      valueMinor: 300000,
      expectedCloseDate: '2026-09-01',
      stageId: 's2',
      probability: 40,
      ownerId: 'u2',
    }),
  ];
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PipelinePage />
    </MemoryRouter>,
  );
}

/** Header row of a board column: `<dot> <stage name> <count> <total value>`. */
function stageRow(stageName: string): HTMLElement {
  const header = screen.getByText(stageName, { selector: 'span' }).closest('div');
  return (header?.parentElement ?? header) as HTMLElement;
}

/** Deal names in the order the list view renders them. */
function listOrder(): string[] {
  const table = screen.getByRole('table');
  return Array.from(table.querySelectorAll('tbody tr')).map(
    (row) => row.querySelector('a')?.textContent ?? '',
  );
}

// Vitest runs without `globals: true`, so @testing-library/react cannot register
// its automatic afterEach cleanup; unmount between tests explicitly.
afterEach(() => cleanup());

describe('PipelinePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations, so drop any per-test resolution
    // behavior before restoring the shared defaults below.
    h.listOpportunities.mockReset();
    h.moveOpportunityStage.mockReset();
    h.useMeta.mockReturnValue({
      stages: STAGES,
      users: USERS,
      stageById: (id: string) => STAGES.find((s) => s.id === id),
      userName: (id?: string) => USER_NAMES[id ?? ''] ?? 'Unknown',
      accountName: (id?: string) => ACCOUNT_NAMES[id ?? ''] ?? 'Unknown',
    });
    h.useSession.mockReturnValue({ user: ADMIN });
    h.toCsv.mockReturnValue('csv-content');
    h.listOpportunities.mockResolvedValue(listResult(defaultDeals()));
    h.moveOpportunityStage.mockImplementation((_id: string) => Promise.resolve(makeOpp()));
  });

  describe('query states', () => {
    it('requests every deal on mount and shows the loading state', async () => {
      let resolveList!: (value: ListResult<Opportunity>) => void;
      h.listOpportunities.mockImplementationOnce(
        () => new Promise<ListResult<Opportunity>>((resolve) => (resolveList = resolve)),
      );

      renderPage();

      expect(screen.getByText('Loading…')).toBeInTheDocument();
      expect(h.listOpportunities).toHaveBeenCalledTimes(1);
      expect(h.listOpportunities).toHaveBeenCalledWith();

      resolveList(listResult([]));
      expect(
        await screen.findByText(`0 deals · ${formatCurrency(0)} total value`),
      ).toBeInTheDocument();
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });

    it('renders the error banner when the load fails', async () => {
      h.listOpportunities.mockRejectedValue(new Error('Pipeline unavailable'));

      renderPage();

      expect(await screen.findByText('Pipeline unavailable')).toBeInTheDocument();
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });

    it('falls back to a generic message for non-Error load failures', async () => {
      h.listOpportunities.mockRejectedValue('not-an-error');

      renderPage();

      expect(await screen.findByText('Failed to load')).toBeInTheDocument();
    });
  });

  describe('board view', () => {
    it('renders one column per stage ordered by stage order', async () => {
      renderPage();

      expect(await screen.findByText('Alpha deal')).toBeInTheDocument();
      const options = screen.getByLabelText('Filter by stage').querySelectorAll('option');
      expect(Array.from(options).map((o) => o.textContent)).toEqual([
        'All stages',
        'Discovery',
        'Proposal',
        'Won',
        'Lost',
      ]);
    });

    it('renders each deal with account, value, owner initials and close date', async () => {
      renderPage();

      await screen.findByText('Alpha deal');
      const card = screen.getByText('Alpha deal').closest('[draggable]') as HTMLElement;
      expect(within(card).getByRole('link')).toHaveAttribute('href', '/opportunities/o1');
      expect(within(card).getByText('Acme Corp')).toBeInTheDocument();
      expect(within(card).getByText(formatCurrency(150000, 'USD'))).toBeInTheDocument();
      expect(within(card).getByText(formatDate('2026-06-30'))).toBeInTheDocument();
      // Owner initials come from the resolved user name.
      expect(within(card).getByText('AL')).toBeInTheDocument();
      expect(
        within(screen.getByText('Beta deal').closest('[draggable]') as HTMLElement).getByText('BS'),
      ).toBeInTheDocument();
    });

    it('shows the deal count and total value per column', async () => {
      renderPage();
      await screen.findByText('Alpha deal');

      // Discovery holds only o1…
      expect(within(stageRow('Discovery')).getByText('1')).toBeInTheDocument();
      expect(within(stageRow('Discovery')).getByText(formatCurrency(150000))).toBeInTheDocument();
      // …Proposal only o2…
      expect(within(stageRow('Proposal')).getByText('1')).toBeInTheDocument();
      expect(within(stageRow('Proposal')).getByText(formatCurrency(300000))).toBeInTheDocument();
      // …and the empty columns show a placeholder plus a zero total.
      expect(within(stageRow('Won')).getByText('0')).toBeInTheDocument();
      expect(within(stageRow('Won')).getByText(formatCurrency(0))).toBeInTheDocument();
      expect(screen.getAllByText('Drop a deal here')).toHaveLength(2);
    });

    it('shows the running total of the visible deals', async () => {
      renderPage();
      await screen.findByText('Alpha deal');

      expect(
        screen.getByText(`2 deals · ${formatCurrency(450000)} total value`),
      ).toBeInTheDocument();
    });
  });

  describe('filters', () => {
    it('filters by stage', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha deal');

      await user.selectOptions(screen.getByLabelText('Filter by stage'), 's2');

      await waitFor(() =>
        expect(
          screen.getByText(`1 deals · ${formatCurrency(300000)} total value`),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText('Alpha deal')).not.toBeInTheDocument();
      expect(screen.getByText('Beta deal')).toBeInTheDocument();
    });

    it('filters by owner and hides the owner filter from reps', async () => {
      const user = userEvent.setup();
      h.useSession.mockReturnValue({ user: REP });
      renderPage();
      await screen.findByText('Alpha deal');

      expect(screen.queryByLabelText('Filter by owner')).not.toBeInTheDocument();

      cleanup();
      h.useSession.mockReturnValue({ user: ADMIN });
      renderPage();
      await screen.findByText('Alpha deal');

      await user.selectOptions(screen.getByLabelText('Filter by owner'), 'u2');

      await waitFor(() => expect(screen.queryByText('Alpha deal')).not.toBeInTheDocument());
      expect(screen.getByText('Beta deal')).toBeInTheDocument();
    });
  });

  describe('list view', () => {
    it('switches to the table view on demand', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha deal');

      await user.click(screen.getByRole('button', { name: 'List' }));

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.queryByText('Drop a deal here')).not.toBeInTheDocument();
      const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
      expect(headers).toEqual(['Deal', 'Value ↓', 'Close date', 'Stage', 'Owner']);
    });

    it('sorts by value, close date, stage, and owner and flips direction', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha deal');
      await user.click(screen.getByRole('button', { name: 'List' }));

      // Default: value descending.
      expect(listOrder()).toEqual(['Beta deal', 'Alpha deal']);

      await user.click(screen.getByRole('button', { name: /^Value/ }));
      expect(listOrder()).toEqual(['Alpha deal', 'Beta deal']);
      expect(screen.getByRole('button', { name: /^Value/ })).toHaveTextContent('Value ↑');

      await user.click(screen.getByRole('button', { name: /^Close date/ }));
      expect(listOrder()).toEqual(['Beta deal', 'Alpha deal']);

      // Stage sorts ascending on first click.
      await user.click(screen.getByRole('button', { name: /^Stage/ }));
      expect(listOrder()).toEqual(['Alpha deal', 'Beta deal']);

      await user.click(screen.getByRole('button', { name: /^Owner/ }));
      expect(listOrder()).toEqual(['Beta deal', 'Alpha deal']);

      await user.click(screen.getByRole('button', { name: /^Owner/ }));
      expect(listOrder()).toEqual(['Alpha deal', 'Beta deal']);
    });

    it('renders the stage badge for each row', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha deal');
      await user.click(screen.getByRole('button', { name: 'List' }));

      expect(within(screen.getByRole('table')).getByText('Discovery')).toBeInTheDocument();
      expect(within(screen.getByRole('table')).getByText('Proposal')).toBeInTheDocument();
      expect(within(screen.getByRole('table')).getByText('Ben Smith')).toBeInTheDocument();
    });
  });

  describe('CSV export', () => {
    it('exports the visible deals and confirms with a toast', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha deal');

      await user.click(screen.getByRole('button', { name: /Export/ }));

      await waitFor(() =>
        expect(h.downloadCsv).toHaveBeenCalledWith('pipeline.csv', 'csv-content'),
      );
      expect(h.toCsv).toHaveBeenCalledWith(
        ['Deal', 'Account', 'Value (USD)', 'Close date', 'Stage', 'Owner'],
        [
          ['Beta deal', 'Initech', '3000.00', '2026-09-01', 'Proposal', 'Ben Smith'],
          ['Alpha deal', 'Acme Corp', '1500.00', '2026-06-30', 'Discovery', 'Ada Lovelace'],
        ],
      );
      expect(h.show).toHaveBeenCalledWith('Exported 2 deals', 'success');
    });

    it('disables export when no deal is visible', async () => {
      h.listOpportunities.mockResolvedValue(listResult([]));
      renderPage();

      await screen.findByText(`0 deals · ${formatCurrency(0)} total value`);
      expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
    });
  });

  describe('stage moves', () => {
    it('moves a deal straight away when its probability is not manual', async () => {
      const user = userEvent.setup();
      h.moveOpportunityStage.mockResolvedValue(makeOpp({ stageId: 's2', probability: 40 }));
      renderPage();
      await screen.findByText('Alpha deal');

      await user.selectOptions(screen.getByLabelText('Move Alpha deal to stage'), 's2');

      await waitFor(() =>
        expect(h.moveOpportunityStage).toHaveBeenCalledWith('o1', {
          toStageId: 's2',
          probabilityChoice: 'default',
          lossReason: undefined,
        }),
      );
      // The server response replaces the optimistic card.
      await waitFor(() => expect(within(stageRow('Proposal')).getByText('2')).toBeInTheDocument());
      expect(within(stageRow('Discovery')).getByText('0')).toBeInTheDocument();
    });

    it('does nothing when the deal is dropped on its current stage', async () => {
      renderPage();
      await screen.findByText('Alpha deal');

      fireEvent.drop(screen.getByText('Discovery', { selector: 'span' }), {
        dataTransfer: { getData: () => 'o1' },
      });

      expect(h.moveOpportunityStage).not.toHaveBeenCalled();
    });

    it('moves a deal dropped from another column', async () => {
      renderPage();
      await screen.findByText('Alpha deal');

      fireEvent.drop(screen.getByText('Won', { selector: 'span' }), {
        dataTransfer: { getData: () => 'o1' },
      });

      await waitFor(() =>
        expect(h.moveOpportunityStage).toHaveBeenCalledWith('o1', {
          toStageId: 's3',
          probabilityChoice: 'default',
          lossReason: undefined,
        }),
      );
    });

    it('falls back to the dragging id when the drop carries no data', async () => {
      h.moveOpportunityStage.mockResolvedValue(makeOpp({ stageId: 's2', probability: 40 }));
      renderPage();
      await screen.findByText('Alpha deal');

      const card = screen.getByText('Alpha deal').closest('[draggable]') as HTMLElement;
      fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn() } });
      // Dragging feedback: the source card is dimmed while in flight.
      expect(card).toHaveClass('opacity-50');

      fireEvent.drop(screen.getByText('Proposal', { selector: 'span' }), {
        dataTransfer: { getData: () => '' },
      });

      await waitFor(() => expect(h.moveOpportunityStage).toHaveBeenCalledTimes(1));
      expect(h.moveOpportunityStage.mock.calls[0][1]).toMatchObject({ toStageId: 's2' });
      // The card is re-created in its new column, so re-query before asserting
      // that the dragging highlight was cleared.
      const movedCard = screen.getByText('Alpha deal').closest('[draggable]') as HTMLElement;
      expect(movedCard).not.toHaveClass('opacity-50');
      expect(within(movedCard).getByRole('combobox')).toHaveValue('s2');
    });

    it('asks before overwriting a manually set probability', async () => {
      const user = userEvent.setup();
      h.listOpportunities.mockResolvedValue(
        listResult([makeOpp({ probability: 25, probabilityManual: true })]),
      );
      h.moveOpportunityStage.mockResolvedValue(makeOpp({ stageId: 's2', probability: 40 }));
      renderPage();
      await screen.findByText('Alpha deal');

      await user.selectOptions(screen.getByLabelText('Move Alpha deal to stage'), 's2');

      expect(await screen.findByRole('dialog')).toHaveAccessibleName('Update probability?');
      expect(h.moveOpportunityStage).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Keep 25%' }));

      await waitFor(() =>
        expect(h.moveOpportunityStage).toHaveBeenCalledWith('o1', {
          toStageId: 's2',
          probabilityChoice: 'keep',
          lossReason: undefined,
        }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('applies the stage probability when the user chooses the default', async () => {
      const user = userEvent.setup();
      h.listOpportunities.mockResolvedValue(
        listResult([makeOpp({ probability: 25, probabilityManual: true })]),
      );
      h.moveOpportunityStage.mockResolvedValue(makeOpp({ stageId: 's2', probability: 40 }));
      renderPage();
      await screen.findByText('Alpha deal');

      await user.selectOptions(screen.getByLabelText('Move Alpha deal to stage'), 's2');
      await user.click(await screen.findByRole('button', { name: 'Use 40%' }));

      await waitFor(() =>
        expect(h.moveOpportunityStage).toHaveBeenCalledWith('o1', {
          toStageId: 's2',
          probabilityChoice: 'default',
          lossReason: undefined,
        }),
      );
    });

    it('closes the probability dialog without moving when cancelled', async () => {
      const user = userEvent.setup();
      h.listOpportunities.mockResolvedValue(
        listResult([makeOpp({ probability: 25, probabilityManual: true })]),
      );
      renderPage();
      await screen.findByText('Alpha deal');

      await user.selectOptions(screen.getByLabelText('Move Alpha deal to stage'), 's2');
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(h.moveOpportunityStage).not.toHaveBeenCalled();
    });

    it('collects a loss reason before moving to a lost stage', async () => {
      const user = userEvent.setup();
      h.moveOpportunityStage.mockResolvedValue(makeOpp({ stageId: 's4', probability: 0 }));
      renderPage();
      await screen.findByText('Alpha deal');

      await user.selectOptions(screen.getByLabelText('Move Alpha deal to stage'), 's4');

      expect(await screen.findByRole('dialog')).toHaveAccessibleName('Mark as lost');
      await user.type(screen.getByLabelText('Loss reason (optional)'), 'Budget frozen');
      await user.click(screen.getByRole('button', { name: 'Mark lost' }));

      await waitFor(() =>
        expect(h.moveOpportunityStage).toHaveBeenCalledWith('o1', {
          toStageId: 's4',
          probabilityChoice: 'default',
          lossReason: 'Budget frozen',
        }),
      );
    });

    it('moves to a lost stage with an empty reason when none is given', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha deal');

      await user.selectOptions(screen.getByLabelText('Move Alpha deal to stage'), 's4');
      await user.click(await screen.findByRole('button', { name: 'Mark lost' }));

      await waitFor(() =>
        expect(h.moveOpportunityStage).toHaveBeenCalledWith('o1', {
          toStageId: 's4',
          probabilityChoice: 'default',
          lossReason: '',
        }),
      );
    });

    it('toasts the failure and reloads the board when a move fails', async () => {
      const user = userEvent.setup();
      h.moveOpportunityStage.mockRejectedValue(new Error('Stage is archived'));
      renderPage();
      await screen.findByText('Alpha deal');

      await user.selectOptions(screen.getByLabelText('Move Alpha deal to stage'), 's2');

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Stage is archived', 'error'));
      await waitFor(() => expect(h.listOpportunities).toHaveBeenCalledTimes(2));
    });

    it('falls back to a generic message for non-Error move failures', async () => {
      const user = userEvent.setup();
      h.moveOpportunityStage.mockRejectedValue('nope');
      renderPage();
      await screen.findByText('Alpha deal');

      await user.selectOptions(screen.getByLabelText('Move Alpha deal to stage'), 's2');

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Move failed', 'error'));
    });
  });

  describe('create modal wiring', () => {
    it('opens the form for a new deal and reloads after a save', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha deal');

      expect(screen.queryByTestId('opp-form')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /New deal/ }));

      expect(screen.getByTestId('opp-form')).toBeInTheDocument();
      expect(screen.getByTestId('opp-form-opp')).toHaveTextContent('');

      await user.click(screen.getByRole('button', { name: 'stub-form-saved' }));
      await waitFor(() => expect(h.listOpportunities).toHaveBeenCalledTimes(2));

      await user.click(screen.getByRole('button', { name: 'stub-form-close' }));
      expect(screen.queryByTestId('opp-form')).not.toBeInTheDocument();
    });
  });
});
