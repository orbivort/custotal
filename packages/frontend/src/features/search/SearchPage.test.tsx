// Component tests for SearchPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - searchApi.searchAll -> grouped results, loading, empty, and error states
// - MetaContext.useMeta -> account names and stage labels used by deal rows
//
// react-router is used for real (MemoryRouter) because the page reads its term
// from the `?q=` query parameter and every row is a Link.
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Account,
  Contact,
  GlobalSearchResults,
  Interaction,
  Opportunity,
  Stage,
  Task,
} from '../../types/domain';
import SearchPage from './SearchPage';

const h = vi.hoisted(() => ({
  searchAll: vi.fn(),
  useMeta: vi.fn(),
}));

vi.mock('./searchApi', () => ({ searchAll: h.searchAll }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));

const AUDIT = {
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00Z',
  updatedBy: 'u1',
};

const STAGES: Stage[] = [
  { id: 's1', name: 'Discovery', order: 1, winProbability: 20, classification: 'open' },
];

const ACCOUNT_NAMES: Record<string, string> = { a1: 'Acme Corp' };

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    status: 'active',
    accountLinks: [],
    ...AUDIT,
    ...overrides,
  };
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Acme Corp',
    industry: 'Manufacturing',
    ownerId: 'u1',
    ...AUDIT,
    ...overrides,
  };
}

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'o1',
    name: 'Acme renewal',
    accountId: 'a1',
    valueMinor: 100000,
    currency: 'USD',
    expectedCloseDate: '2026-05-01',
    stageId: 's1',
    probability: 20,
    probabilityManual: false,
    ownerId: 'u1',
    ...AUDIT,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Call Ada',
    priority: 'medium',
    status: 'open',
    assigneeId: 'u1',
    ...AUDIT,
    ...overrides,
  };
}

function makeInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: 'i1',
    type: 'call',
    dateTime: '2026-01-01T10:00:00Z',
    direction: 'inbound',
    summary: 'Discussed the renewal timeline',
    contactId: 'c1',
    responsibleUserId: 'u1',
    ...AUDIT,
    ...overrides,
  };
}

/** Builds a payload whose counts default to the length of each result list. */
function makeResults(partial: Partial<GlobalSearchResults> = {}): GlobalSearchResults {
  const groups = {
    contacts: partial.contacts ?? [],
    accounts: partial.accounts ?? [],
    opportunities: partial.opportunities ?? [],
    tasks: partial.tasks ?? [],
    interactions: partial.interactions ?? [],
  };
  return {
    ...groups,
    counts: {
      contacts: groups.contacts.length,
      accounts: groups.accounts.length,
      opportunities: groups.opportunities.length,
      tasks: groups.tasks.length,
      interactions: groups.interactions.length,
      ...partial.counts,
    },
  };
}

/** Renders the page at /search with the given raw query string (e.g. '?q=ada'). */
function renderAt(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/search${search}`]}>
      <SearchPage />
    </MemoryRouter>,
  );
}

/** The `<section>` that owns the given heading (the count badge sits outside it). */
function section(label: string): HTMLElement {
  const el = screen.getByRole('heading', { level: 2, name: label }).closest('section');
  if (!el) throw new Error(`No section found for "${label}"`);
  return el as HTMLElement;
}

function rowsOf(label: string): HTMLElement[] {
  return Array.from(section(label).querySelectorAll('li')) as HTMLElement[];
}

function headingLabels(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent ?? '');
}

// Vitest runs without `globals: true`, so @testing-library/react cannot register
// its automatic afterEach cleanup; unmount between tests explicitly.
afterEach(() => cleanup());

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({
      stageById: (id?: string) => STAGES.find((s) => s.id === id),
      accountName: (id?: string) => (id ? (ACCOUNT_NAMES[id] ?? 'Unknown') : 'Unknown'),
    });
    h.searchAll.mockResolvedValue(makeResults());
  });

  it('asks for a term and skips the request when there is no query', async () => {
    renderAt();

    expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toBeInTheDocument();
    expect(screen.getByText('Type to search')).toBeInTheDocument();
    expect(
      screen.getByText(/Use the search box in the header, or open this page with \?q=/),
    ).toBeInTheDocument();
    expect(h.searchAll).not.toHaveBeenCalled();
  });

  it('renders the prompt for a one-character term', async () => {
    renderAt('?q=a');

    expect(await screen.findByText('Type to search')).toBeInTheDocument();
    // The two-character guard is applied when rendering, not when fetching, so
    // the request still fires — the page just keeps showing the prompt.
    expect(h.searchAll).toHaveBeenCalledWith('a', true);
  });

  it('treats a whitespace-only term as too short to search', async () => {
    renderAt('?q=%20%20%20');

    expect(await screen.findByText('Type to search')).toBeInTheDocument();
    expect(h.searchAll).not.toHaveBeenCalled();
  });

  it('trims the term and requests the full result lists', async () => {
    renderAt('?q=%20%20ada%20');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Results for “ada”' }),
    ).toBeInTheDocument();
    expect(h.searchAll).toHaveBeenCalledTimes(1);
    expect(h.searchAll).toHaveBeenCalledWith('ada', true);
  });

  it('shows the loading block while the search is in flight', async () => {
    let resolveResults!: (value: GlobalSearchResults) => void;
    h.searchAll.mockImplementationOnce(
      () => new Promise<GlobalSearchResults>((resolve) => (resolveResults = resolve)),
    );

    renderAt('?q=ada');

    await screen.findByRole('heading', { level: 1, name: 'Results for “ada”' });
    // Both the header subtitle and the loading label read "Searching…".
    expect(screen.getAllByText('Searching…')).toHaveLength(2);

    resolveResults(makeResults({ contacts: [makeContact()] }));

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryAllByText('Searching…')).toHaveLength(0);
  });

  it('surfaces the failure message when the search rejects', async () => {
    h.searchAll.mockRejectedValueOnce(new Error('Search is unavailable'));

    renderAt('?q=ada');

    expect(await screen.findByText('Search is unavailable')).toBeInTheDocument();
    // The spinner is gone, but the header subtitle keeps its "Searching…"
    // fallback because no data ever arrived.
    expect(screen.queryByLabelText('Loading')).not.toBeInTheDocument();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('renders one section per entity, in order, with counts and deep links', async () => {
    h.searchAll.mockResolvedValue(
      makeResults({
        contacts: [makeContact()],
        accounts: [makeAccount()],
        opportunities: [makeOpportunity()],
        tasks: [makeTask()],
        interactions: [makeInteraction()],
      }),
    );

    renderAt('?q=ada');

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(headingLabels()).toEqual(['Contacts', 'Accounts', 'Deals', 'Tasks', 'Interactions']);

    // Every section repeats its group total in a badge.
    for (const label of ['Contacts', 'Accounts', 'Deals', 'Tasks', 'Interactions']) {
      expect(within(section(label)).getByText('1')).toBeInTheDocument();
    }

    expect(within(rowsOf('Contacts')[0]).getByRole('link')).toHaveAttribute('href', '/contacts/c1');
    expect(within(rowsOf('Accounts')[0]).getByRole('link')).toHaveAttribute('href', '/accounts/a1');
    expect(within(rowsOf('Deals')[0]).getByRole('link')).toHaveAttribute(
      'href',
      '/opportunities/o1',
    );
    expect(within(rowsOf('Tasks')[0]).getByRole('link')).toHaveAttribute('href', '/tasks');
    expect(within(rowsOf('Interactions')[0]).getByRole('link')).toHaveAttribute(
      'href',
      '/contacts/c1',
    );

    expect(screen.getByText('5 matches across the workspace')).toBeInTheDocument();
  });

  it('hides sections whose group has no matches', async () => {
    h.searchAll.mockResolvedValue(makeResults({ contacts: [makeContact()] }));

    renderAt('?q=ada');

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(headingLabels()).toEqual(['Contacts']);
    expect(screen.queryByRole('heading', { level: 2, name: 'Accounts' })).not.toBeInTheDocument();
  });

  it('pluralizes the result total and uses the singular form for one match', async () => {
    h.searchAll.mockResolvedValue(makeResults({ contacts: [makeContact()] }));

    renderAt('?q=ada');

    expect(await screen.findByText('1 match across the workspace')).toBeInTheDocument();
  });

  it('falls back through job title, email, phone, and a placeholder for contact rows', async () => {
    h.searchAll.mockResolvedValue(
      makeResults({
        contacts: [
          makeContact({ id: 'c1', firstName: 'Ada', lastName: 'Lovelace', jobTitle: 'CTO' }),
          makeContact({
            id: 'c2',
            firstName: 'Ben',
            lastName: 'Smith',
            email: undefined,
            phone: '+1 555',
          }),
          makeContact({
            id: 'c3',
            firstName: 'Cy',
            lastName: 'Doe',
            email: undefined,
            phone: undefined,
          }),
        ],
      }),
    );

    renderAt('?q=ada');

    expect(await screen.findByText('Cy Doe')).toBeInTheDocument();
    const lines = rowsOf('Contacts').map((li) => li.textContent);
    expect(lines[0]).toContain('CTO · ada@example.com');
    // No job title => the generic label; no email => the phone number.
    expect(lines[1]).toContain('Contact · +1 555');
    expect(lines[2]).toContain('Contact · no contact info');
  });

  it('uses the account industry, or a placeholder when it is missing', async () => {
    h.searchAll.mockResolvedValue(
      makeResults({
        accounts: [
          makeAccount({ id: 'a1' }),
          makeAccount({ id: 'a2', name: 'Globex', industry: undefined }),
        ],
      }),
    );

    renderAt('?q=ada');

    expect(await screen.findByText('Globex')).toBeInTheDocument();
    const lines = rowsOf('Accounts').map((li) => li.textContent);
    expect(lines[0]).toContain('Manufacturing');
    expect(lines[1]).toContain('No industry');
  });

  it('labels deal rows with the account name and stage, with fallbacks', async () => {
    h.searchAll.mockResolvedValue(
      makeResults({
        opportunities: [
          makeOpportunity({ id: 'o1', name: 'Acme renewal', accountId: 'a1', stageId: 's1' }),
          makeOpportunity({ id: 'o2', name: 'Unknown stage deal', accountId: 'a1', stageId: 'sX' }),
          makeOpportunity({
            id: 'o3',
            name: 'Unknown account deal',
            accountId: 'aX',
            stageId: 's1',
          }),
        ],
      }),
    );

    renderAt('?q=ada');

    expect(await screen.findByText('Unknown account deal')).toBeInTheDocument();
    const lines = rowsOf('Deals').map((li) => li.textContent);
    expect(lines[0]).toContain('Acme Corp · Discovery');
    expect(lines[1]).toContain('Acme Corp · Deal');
    expect(lines[2]).toContain('Unknown · Discovery');
  });

  it('shows the task due date, or a follow-up hint when there is none', async () => {
    h.searchAll.mockResolvedValue(
      makeResults({
        tasks: [
          makeTask({ id: 't1', dueDate: '2026-03-01' }),
          makeTask({ id: 't2', title: 'Email Ada', dueDate: undefined }),
        ],
      }),
    );

    renderAt('?q=ada');

    expect(await screen.findByText('Email Ada')).toBeInTheDocument();
    const lines = rowsOf('Tasks').map((li) => li.textContent);
    expect(lines[0]).toContain('Due 2026-03-01');
    expect(lines[1]).toContain('Follow-up');
  });

  it('renders interaction type and direction, truncating long summaries', async () => {
    const longSummary = 'x'.repeat(200);
    h.searchAll.mockResolvedValue(
      makeResults({
        interactions: [
          makeInteraction({ id: 'i1' }),
          makeInteraction({ id: 'i2', type: 'email', direction: undefined, summary: 'Short note' }),
          makeInteraction({ id: 'i3', type: 'note', summary: longSummary }),
        ],
      }),
    );

    renderAt('?q=ada');

    expect(await screen.findByText('email')).toBeInTheDocument();
    const lines = rowsOf('Interactions').map((li) => li.textContent);
    expect(lines[0]).toContain('call · inbound');
    // No direction => the type alone.
    expect(lines[1]).toContain('email');
    expect(lines[1]).not.toContain('·');
    expect(lines[2]).toContain(`${'x'.repeat(140)}…`);
    expect(screen.queryByText(longSummary)).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing matched the term', async () => {
    h.searchAll.mockResolvedValue(makeResults());

    renderAt('?q=ada');

    expect(await screen.findByText('No results found')).toBeInTheDocument();
    expect(screen.getByText(/Nothing matched “ada”/)).toBeInTheDocument();
    expect(screen.getByText('0 matches across the workspace')).toBeInTheDocument();
  });

  it('always reminds the user that visibility rules apply', async () => {
    h.searchAll.mockResolvedValue(makeResults());

    renderAt('?q=ada');

    expect(await screen.findByText('No results found')).toBeInTheDocument();
    expect(screen.getByText(/Results respect your role/)).toBeInTheDocument();
  });

  it('reminds the user about visibility rules on the empty-term screen too', async () => {
    renderAt();

    expect(await screen.findByText('Type to search')).toBeInTheDocument();
    // The footnote is below the early return, so it must not be rendered there.
    expect(screen.queryByText(/Results respect your role/)).not.toBeInTheDocument();
  });
});
