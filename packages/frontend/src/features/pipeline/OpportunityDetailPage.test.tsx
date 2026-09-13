// Component tests for OpportunityDetailPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - opportunitiesApi.getOpportunity/deleteOpportunity -> data + delete mutation
// - accountsApi.getAccount          -> account contacts for the quick-log form
// - MetaContext.useMeta             -> stage / user / account name resolution
// - SessionContext.useSession       -> RBAC (canWrite stays real)
// - toast.useToast                  -> feedback (success / error assertions)
// - react-router.useNavigate        -> redirect assertions (routing stays real, so
//   `useParams` supplies the deal id exactly as it does in the app)
// - QuickLogForm / Timeline / OpportunityFormModal -> stubbed children, so their
//   own network calls stay out of these tests while their wiring is still
//   asserted.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCurrency, formatDate, formatDateTime, formatPercent } from '../../lib/format';
import type {
  AccountDetailPayload,
  Opportunity,
  OpportunityDetail,
  Stage,
  User,
} from '../../types/domain';
import OpportunityDetailPage from './OpportunityDetailPage';

const h = vi.hoisted(() => ({
  getOpportunity: vi.fn(),
  deleteOpportunity: vi.fn(),
  getAccount: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  show: vi.fn(),
  navigate: vi.fn(),
  timelineMount: vi.fn(),
}));

vi.mock('./opportunitiesApi', () => ({
  getOpportunity: h.getOpportunity,
  deleteOpportunity: h.deleteOpportunity,
}));
vi.mock('../accounts/accountsApi', () => ({ getAccount: h.getAccount }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => h.navigate };
});

vi.mock('../interactions/QuickLogForm', () => ({
  QuickLogForm: ({
    contactId,
    opportunityId,
    contacts,
    onSaved,
  }: {
    contactId?: string;
    opportunityId?: string;
    contacts?: { id: string; name: string }[];
    onSaved: () => void;
  }) => (
    <div data-testid="quick-log">
      <span data-testid="quick-log-contact">{contactId ?? ''}</span>
      <span data-testid="quick-log-opp">{opportunityId ?? ''}</span>
      <span data-testid="quick-log-contacts">
        {contacts ? contacts.map((c) => c.name).join('|') : 'no-override'}
      </span>
      <button onClick={onSaved}>stub-log-saved</button>
    </div>
  ),
}));

vi.mock('../interactions/Timeline', async () => {
  const { useEffect } = await import('react');
  return {
    Timeline: ({ opportunityId }: { opportunityId?: string }) => {
      // Remounting proves the page bumped the timeline key after a new log.
      useEffect(() => {
        h.timelineMount();
      }, []);
      return <div data-testid="timeline">{opportunityId}</div>;
    },
  };
});

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
      <div data-testid="edit-modal">
        <span data-testid="edit-modal-opp">{opportunity?.name ?? ''}</span>
        <button onClick={onSaved}>stub-saved</button>
        <button onClick={onClose}>stub-close</button>
      </div>
    ) : null,
}));

const STAGES: Stage[] = [
  { id: 's1', name: 'Discovery', order: 1, winProbability: 10, classification: 'open' },
  { id: 's2', name: 'Proposal', order: 2, winProbability: 40, classification: 'open' },
  { id: 's3', name: 'Won', order: 3, winProbability: 100, classification: 'won' },
  { id: 's4', name: 'Lost', order: 4, winProbability: 0, classification: 'lost' },
];

const ADMIN: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' };
const READONLY: User = { id: 'u3', name: 'Rea Donly', email: 'rea@example.com', role: 'readonly' };

const USER_NAMES: Record<string, string> = { u1: 'Ada Lovelace', u2: 'Ben Smith' };
const STAGE_NAMES: Record<string, string> = {
  s1: 'Discovery',
  s2: 'Proposal',
  s3: 'Won',
  s4: 'Lost',
};

function makeOpportunity(overrides: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    id: 'o1',
    name: 'Platform renewal',
    contactId: 'c1',
    accountId: 'acc1',
    valueMinor: 250000,
    currency: 'USD',
    expectedCloseDate: '2026-06-30',
    stageId: 's1',
    probability: 25,
    probabilityManual: true,
    ownerId: 'u2',
    description: 'Renewal with an upsell',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    history: [
      {
        id: 'h1',
        opportunityId: 'o1',
        fromStageId: null,
        toStageId: 's1',
        userId: 'u1',
        timestamp: '2026-01-01T09:00:00Z',
      },
      {
        id: 'h2',
        opportunityId: 'o1',
        fromStageId: 's1',
        toStageId: 's2',
        userId: 'u2',
        timestamp: '2026-02-01T10:30:00Z',
      },
    ],
    ...overrides,
  };
}

function accountPayload(overrides: Partial<AccountDetailPayload> = {}): AccountDetailPayload {
  return {
    account: {
      id: 'acc1',
      name: 'Acme Corp',
      ownerId: 'u1',
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'u1',
      updatedAt: '2026-01-02T00:00:00Z',
      updatedBy: 'u1',
    },
    contacts: [
      {
        id: 'c1',
        firstName: 'Grace',
        lastName: 'Hopper',
        status: 'active',
        accountLinks: [],
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'u1',
        updatedAt: '2026-01-02T00:00:00Z',
        updatedBy: 'u1',
      },
    ],
    opportunities: [],
    ...overrides,
  };
}

/** The <section> that a card/heading title belongs to. */
function sectionFor(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).parentElement as HTMLElement;
}

function renderPage(id = 'o1') {
  return render(
    <MemoryRouter initialEntries={[`/opportunities/${id}`]}>
      <Routes>
        <Route path="/opportunities/:id" element={<OpportunityDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Vitest globals are disabled, so RTL's automatic cleanup does not run.
afterEach(() => cleanup());

describe('OpportunityDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({
      stageById: (id: string) => STAGES.find((s) => s.id === id),
      stageName: (id?: string) => STAGE_NAMES[id ?? ''] ?? 'Unknown',
      userName: (id?: string) => USER_NAMES[id ?? ''] ?? 'Unknown',
      accountName: (id?: string) => (id === 'acc1' ? 'Acme Corp' : 'Unknown'),
    });
    h.useSession.mockReturnValue({ user: ADMIN });
    h.getOpportunity.mockResolvedValue(makeOpportunity());
    h.getAccount.mockResolvedValue(accountPayload());
    h.deleteOpportunity.mockResolvedValue(undefined);
  });

  describe('query states', () => {
    it('shows the loading block while the deal is fetched', () => {
      h.getOpportunity.mockImplementationOnce(() => new Promise(() => {}));

      renderPage();

      expect(screen.getByText('Loading deal…')).toBeInTheDocument();
      expect(h.getOpportunity).toHaveBeenCalledWith('o1');
    });

    it('shows the error banner when the fetch fails', async () => {
      h.getOpportunity.mockRejectedValue(new Error('Deal is unavailable'));

      renderPage();

      expect(await screen.findByText('Deal is unavailable')).toBeInTheDocument();
      expect(screen.queryByText('Loading deal…')).not.toBeInTheDocument();
    });

    it('falls back to a not-found banner when there is no payload', async () => {
      h.getOpportunity.mockResolvedValue(null);

      renderPage();

      expect(await screen.findByText('Deal not found.')).toBeInTheDocument();
    });
  });

  describe('rendered record', () => {
    it('renders the header, stage badge, and back link', async () => {
      renderPage();

      const heading = await screen.findByRole('heading', { name: 'Platform renewal' });
      // The stage badge sits next to the title.
      expect(
        within(heading.parentElement as HTMLElement).getByText('Discovery'),
      ).toBeInTheDocument();
      expect(screen.getByText(`Acme Corp · ${formatCurrency(250000, 'USD')}`)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Back to pipeline/ })).toHaveAttribute(
        'href',
        '/pipeline',
      );
    });

    it('renders the deal details with resolved names and formatted values', async () => {
      renderPage();

      expect(await screen.findByRole('link', { name: 'Acme Corp' })).toHaveAttribute(
        'href',
        '/accounts/acc1',
      );
      expect(screen.getByRole('link', { name: 'View contact' })).toHaveAttribute(
        'href',
        '/contacts/c1',
      );
      expect(screen.getByText('Ben Smith')).toBeInTheDocument();
      expect(screen.getByText(formatDate('2026-06-30'))).toBeInTheDocument();
      expect(screen.getByText(formatPercent(25))).toBeInTheDocument();
      expect(screen.getByText('(manual)')).toBeInTheDocument();
      expect(screen.getByText(formatCurrency(250000, 'USD'))).toBeInTheDocument();
    });

    it('hides the contact link and the manual marker when not applicable', async () => {
      h.getOpportunity.mockResolvedValue(
        makeOpportunity({ contactId: undefined, probabilityManual: false }),
      );

      renderPage();

      await screen.findByRole('heading', { name: 'Platform renewal' });
      expect(screen.queryByRole('link', { name: 'View contact' })).not.toBeInTheDocument();
      expect(screen.queryByText('(manual)')).not.toBeInTheDocument();
    });

    it('renders the description only when the deal has one', async () => {
      h.getOpportunity.mockResolvedValue(makeOpportunity({ description: undefined }));

      renderPage();

      await screen.findByRole('heading', { name: 'Platform renewal' });
      expect(screen.queryByText('Description')).not.toBeInTheDocument();
    });

    it('renders the stage history with created and moved entries', async () => {
      renderPage();

      await screen.findByRole('heading', { name: 'Platform renewal' });
      const history = sectionFor('Stage history');
      const entries = within(history).getAllByRole('listitem');
      expect(entries).toHaveLength(2);
      expect(entries[0]).toHaveTextContent('Created in');
      expect(entries[1]).toHaveTextContent('Moved from');
      // Discovery is both the creation stage and the source of the move.
      expect(within(history).getAllByText('Discovery')).toHaveLength(2);
      expect(within(history).getByText('Proposal')).toBeInTheDocument();
      expect(
        screen.getByText(`Ada Lovelace · ${formatDateTime('2026-01-01T09:00:00Z')}`),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`Ben Smith · ${formatDateTime('2026-02-01T10:30:00Z')}`),
      ).toBeInTheDocument();
    });

    it('renders an empty history state when nothing has been recorded', async () => {
      h.getOpportunity.mockResolvedValue(makeOpportunity({ history: [] }));

      renderPage();

      expect(await screen.findByText('No stage transitions recorded.')).toBeInTheDocument();
    });

    it('shows the loss reason card for a lost deal', async () => {
      h.getOpportunity.mockResolvedValue(
        makeOpportunity({ stageId: 's4', lossReason: 'Budget frozen' }),
      );

      renderPage();

      expect(await screen.findByText('Loss reason')).toBeInTheDocument();
      expect(screen.getByText('Budget frozen')).toBeInTheDocument();
    });

    it('falls back to a placeholder when a lost deal has no reason', async () => {
      h.getOpportunity.mockResolvedValue(makeOpportunity({ stageId: 's4' }));

      renderPage();

      expect(await screen.findByText('Loss reason')).toBeInTheDocument();
      expect(screen.getByText('Not specified')).toBeInTheDocument();
    });

    it('hides the loss reason card for an open deal', async () => {
      renderPage();

      await screen.findByRole('heading', { name: 'Platform renewal' });
      expect(screen.queryByText('Loss reason')).not.toBeInTheDocument();
    });
  });

  describe('child widgets', () => {
    it('passes the deal and its account contacts to the quick-log form', async () => {
      renderPage();

      await screen.findByTestId('quick-log');
      // The contacts come from a second query keyed on the deal's account, so it
      // lands a render (and one passive effect) after the quick-log form mounts.
      await waitFor(() => {
        expect(h.getAccount).toHaveBeenCalledWith('acc1');
        expect(screen.getByTestId('quick-log-contacts')).toHaveTextContent('Grace Hopper');
      });
      expect(screen.getByTestId('quick-log-contact')).toHaveTextContent('c1');
      expect(screen.getByTestId('quick-log-opp')).toHaveTextContent('o1');
      expect(screen.getByTestId('timeline')).toHaveTextContent('o1');
    });

    it('leaves the contact list to the quick-log form when the account has none', async () => {
      h.getAccount.mockResolvedValue(accountPayload({ contacts: [] }));

      renderPage();

      await screen.findByTestId('quick-log');
      await waitFor(() =>
        expect(screen.getByTestId('quick-log-contacts')).toHaveTextContent('no-override'),
      );
    });

    it('remounts the timeline when an interaction is logged', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('quick-log');

      expect(h.timelineMount).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: 'stub-log-saved' }));

      await waitFor(() => expect(h.timelineMount).toHaveBeenCalledTimes(2));
    });
  });

  describe('edit modal', () => {
    it('opens the form with the deal and reloads after a save', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Platform renewal' });

      expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Edit/ }));

      expect(screen.getByTestId('edit-modal-opp')).toHaveTextContent('Platform renewal');

      await user.click(screen.getByRole('button', { name: 'stub-saved' }));

      await waitFor(() => expect(h.getOpportunity).toHaveBeenCalledTimes(2));
    });

    it('closes the form without reloading when dismissed', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Platform renewal' });

      await user.click(screen.getByRole('button', { name: /Edit/ }));
      await user.click(screen.getByRole('button', { name: 'stub-close' }));

      expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument();
      expect(h.getOpportunity).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    it('opens a confirmation dialog instead of deleting immediately', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Platform renewal' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));

      expect(await screen.findByRole('dialog', { name: 'Delete deal' })).toBeInTheDocument();
      expect(h.deleteOpportunity).not.toHaveBeenCalled();
    });

    it('deletes, toasts, and returns to the pipeline once confirmed', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Platform renewal' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.deleteOpportunity).toHaveBeenCalledWith('o1'));
      expect(h.show).toHaveBeenCalledWith('Deal deleted', 'success');
      expect(h.navigate).toHaveBeenCalledWith('/pipeline');
    });

    it('does not delete when the dialog is dismissed', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { name: 'Platform renewal' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(h.deleteOpportunity).not.toHaveBeenCalled();
      expect(h.navigate).not.toHaveBeenCalled();
    });

    it('toasts the failure message when the delete rejects', async () => {
      const user = userEvent.setup();
      h.deleteOpportunity.mockRejectedValueOnce(new Error('Forbidden'));
      renderPage();
      await screen.findByRole('heading', { name: 'Platform renewal' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.show).toHaveBeenCalledWith('Forbidden', 'error'));
      expect(h.navigate).not.toHaveBeenCalled();
    });
  });

  describe('read-only access', () => {
    beforeEach(() => {
      h.useSession.mockReturnValue({ user: READONLY });
    });

    it('hides the delete control but keeps the record visible', async () => {
      renderPage();

      await screen.findByRole('heading', { name: 'Platform renewal' });
      expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument();
    });
  });

  describe('missing route param', () => {
    it('fetches with an empty id when the route carries none', async () => {
      render(
        <MemoryRouter initialEntries={['/opportunities']}>
          <Routes>
            <Route path="/opportunities" element={<OpportunityDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await screen.findByRole('heading', { name: 'Platform renewal' });
      expect(h.getOpportunity).toHaveBeenCalledWith('');
    });

    it('deletes with an empty id when the route carries none', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/opportunities']}>
          <Routes>
            <Route path="/opportunities" element={<OpportunityDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByRole('heading', { name: 'Platform renewal' });

      await user.click(screen.getByRole('button', { name: /Delete/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(h.deleteOpportunity).toHaveBeenCalledWith(''));
      expect(h.navigate).toHaveBeenCalledWith('/pipeline');
    });
  });
});
