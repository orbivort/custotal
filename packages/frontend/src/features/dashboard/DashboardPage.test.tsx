// Component tests for DashboardPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - opportunitiesApi.listOpportunities -> loading / data / empty states
// - tasksApi.listTasks / getTaskSummary -> follow-up list and "due today" KPI
// - MetaContext.useMeta                -> stage classification + account names
// - SessionContext.useSession          -> greeting name
//
// lib/format is intentionally NOT mocked: the assertions derive expected strings
// from the same helpers the page uses, so formatting stays covered end to end.
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCurrency, formatDate, greeting, todayISO } from '../../lib/format';
import type { ListResult, Opportunity, Stage, Task, TaskSummary, User } from '../../types/domain';
import DashboardPage from './DashboardPage';

const h = vi.hoisted(() => ({
  listOpportunities: vi.fn(),
  listTasks: vi.fn(),
  getTaskSummary: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('../pipeline/opportunitiesApi', () => ({ listOpportunities: h.listOpportunities }));
vi.mock('../tasks/tasksApi', () => ({
  listTasks: h.listTasks,
  getTaskSummary: h.getTaskSummary,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));

const USER: User = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'rep' };

const STAGES: Stage[] = [
  { id: 's1', name: 'Discovery', order: 1, winProbability: 20, classification: 'open' },
  { id: 's2', name: 'Proposal', order: 2, winProbability: 60, classification: 'open' },
  { id: 's3', name: 'Won', order: 3, winProbability: 100, classification: 'won' },
  { id: 's4', name: 'Lost', order: 4, winProbability: 0, classification: 'lost' },
];

const ACCOUNT_NAMES: Record<string, string> = { acc1: 'Acme Corp', acc2: 'Globex' };

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

/** `YYYY-MM` of the current month — the page buckets deals by this prefix. */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** A date inside the current month (day 1–28 to avoid month-length overflow). */
function thisMonth(day: number): string {
  return `${currentMonthKey()}-${String(day).padStart(2, '0')}`;
}

/** A date guaranteed to sit outside the current month. */
function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
}

function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'o1',
    name: 'Acme renewal',
    accountId: 'acc1',
    valueMinor: 100000,
    currency: 'USD',
    expectedCloseDate: thisMonth(15),
    stageId: 's1',
    probability: 20,
    probabilityManual: false,
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Call Ada',
    dueDate: thisMonth(10),
    priority: 'medium',
    status: 'open',
    assigneeId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
    ...overrides,
  };
}

function listResult<T>(items: T[]): ListResult<T> {
  return { items, total: items.length };
}

/** The header salutation the page renders right now (derived from lib/format). */
function greetingTitle(firstName: string): string {
  return `${greeting()}, ${firstName}.`;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

/** The `<section>` that owns the given heading (heading text includes an icon). */
function section(name: RegExp): HTMLElement {
  const el = screen.getByRole('heading', { name }).closest('section');
  if (!el) throw new Error(`No section found for heading ${String(name)}`);
  return el as HTMLElement;
}

function listItems(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll('li')) as HTMLElement[];
}

/**
 * Reads a KPI card by label. The "Open pipeline" label is also used by the
 * deals section heading, so pick the paragraph rather than the heading.
 */
function kpi(label: string): { value: string; sub: string } {
  const node = screen.getAllByText(label).find((el) => !el.closest('h2'));
  const card = node?.parentElement;
  if (!card) throw new Error(`No KPI card found for "${label}"`);
  const paragraphs = card.querySelectorAll('p');
  return {
    value: paragraphs[1]?.textContent ?? '',
    sub: paragraphs[2]?.textContent ?? '',
  };
}

// Vitest runs without `globals: true`, so @testing-library/react cannot register
// its automatic afterEach cleanup; unmount between tests explicitly.
afterEach(() => cleanup());

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.useSession.mockReturnValue({ user: USER });
    h.useMeta.mockReturnValue({
      stageById: (id?: string) => STAGES.find((s) => s.id === id),
      accountName: (id?: string) => (id ? (ACCOUNT_NAMES[id] ?? 'Unknown') : 'Unknown'),
    });
    h.listOpportunities.mockResolvedValue(listResult<Opportunity>([]));
    h.listTasks.mockResolvedValue(listResult<Task>([]));
    h.getTaskSummary.mockResolvedValue({ dueToday: 0, overdue: 0 } satisfies TaskSummary);
  });

  it('greets the signed-in user by first name and dates the header', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: greetingTitle('Ada') }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Here's your pipeline at a glance for ${formatDate(todayISO())}.`),
    ).toBeInTheDocument();
  });

  it('falls back to "there" when no user is signed in', async () => {
    h.useSession.mockReturnValue({ user: null });

    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: greetingTitle('there') }),
    ).toBeInTheDocument();
  });

  it('uses the whole name when it has no space', async () => {
    h.useSession.mockReturnValue({ user: { ...USER, name: 'Ada' } });

    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: greetingTitle('Ada') }),
    ).toBeInTheDocument();
  });

  it('shows the loading block while opportunities load and zeroes the KPIs', async () => {
    let resolveOpps!: (value: ListResult<Opportunity>) => void;
    h.listOpportunities.mockImplementationOnce(
      () => new Promise<ListResult<Opportunity>>((resolve) => (resolveOpps = resolve)),
    );

    renderPage();

    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(kpi('Open pipeline')).toEqual({ value: formatCurrency(0), sub: '0 open deals' });
    expect(kpi('Tasks due today')).toEqual({ value: '0', sub: 'open follow-ups' });

    resolveOpps(listResult([makeOpp()]));
    expect(await screen.findByText('Acme renewal')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('renders the top open deals by value with account, stage, amount, and close date', async () => {
    h.listOpportunities.mockResolvedValue(
      listResult([
        makeOpp({
          id: 'o1',
          name: 'Acme renewal',
          accountId: 'acc1',
          valueMinor: 100000,
          stageId: 's1',
          expectedCloseDate: thisMonth(10),
        }),
        makeOpp({
          id: 'o2',
          name: 'Globex expansion',
          accountId: 'acc2',
          valueMinor: 250000,
          stageId: 's2',
          expectedCloseDate: thisMonth(20),
        }),
        makeOpp({
          id: 'o3',
          name: 'Mystery deal',
          accountId: 'accX',
          valueMinor: 75000,
          stageId: 's1',
          expectedCloseDate: thisMonth(5),
        }),
        makeOpp({ id: 'o4', name: 'Already won', valueMinor: 999000, stageId: 's3' }),
      ]),
    );

    renderPage();

    expect(await screen.findByText('Globex expansion')).toBeInTheDocument();
    const items = listItems(section(/Open pipeline/));
    // Won deals are excluded and the rest are ordered by descending value.
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole('link')).toHaveAttribute('href', '/opportunities/o2');
    expect(within(items[1]).getByRole('link')).toHaveAttribute('href', '/opportunities/o1');
    expect(within(items[2]).getByRole('link')).toHaveAttribute('href', '/opportunities/o3');
    // Account names resolve through useMeta, with a fallback for unknown ids.
    expect(within(items[0]).getByText('Globex')).toBeInTheDocument();
    expect(within(items[2]).getByText('Unknown')).toBeInTheDocument();
    // Stage badge, own-currency amount, and formatted close date.
    expect(within(items[0]).getByText('Proposal')).toBeInTheDocument();
    expect(within(items[0]).getByText(formatCurrency(250000, 'USD'))).toBeInTheDocument();
    expect(within(items[0]).getByText(formatDate(thisMonth(20)))).toBeInTheDocument();
    expect(screen.queryByText('Already won')).not.toBeInTheDocument();
  });

  it('caps the top deals list at five entries', async () => {
    h.listOpportunities.mockResolvedValue(
      listResult(
        Array.from({ length: 7 }, (_, i) =>
          makeOpp({ id: `o${i}`, name: `Deal ${i}`, valueMinor: (i + 1) * 1000 }),
        ),
      ),
    );

    renderPage();

    expect(await screen.findByText('Deal 6')).toBeInTheDocument();
    // Descending value: Deal 6 (7000) … Deal 2 (3000); Deal 1 and Deal 0 drop off.
    const names = listItems(section(/Open pipeline/)).map((li) => li.textContent);
    expect(names).toHaveLength(5);
    expect(names[0]).toContain('Deal 6');
    expect(names[4]).toContain('Deal 2');
    expect(screen.queryByText('Deal 1')).not.toBeInTheDocument();
  });

  it('formats each deal in its own currency but the KPI total in the default one', async () => {
    h.listOpportunities.mockResolvedValue(
      listResult([makeOpp({ valueMinor: 123456, currency: 'EUR' })]),
    );

    renderPage();

    expect(await screen.findByText(formatCurrency(123456, 'EUR'))).toBeInTheDocument();
    expect(kpi('Open pipeline')).toEqual({
      value: formatCurrency(123456),
      sub: '1 open deals',
    });
  });

  it('shows the empty state when there are no open deals', async () => {
    h.listOpportunities.mockResolvedValue(
      listResult([makeOpp({ stageId: 's3' }), makeOpp({ id: 'o2', stageId: 's4' })]),
    );

    renderPage();

    expect(await screen.findByText('No open deals in your pipeline.')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('falls back to the empty state when the opportunities query fails', async () => {
    h.listOpportunities.mockRejectedValue(new Error('Boom'));

    renderPage();

    expect(await screen.findByText('No open deals in your pipeline.')).toBeInTheDocument();
    expect(kpi('Open pipeline')).toEqual({ value: formatCurrency(0), sub: '0 open deals' });
  });

  it('counts only open deals for the pipeline KPIs and ignores unknown stages', async () => {
    h.listOpportunities.mockResolvedValue(
      listResult([
        makeOpp({
          id: 'o1',
          name: 'Open now',
          stageId: 's1',
          valueMinor: 100000,
          expectedCloseDate: thisMonth(5),
        }),
        makeOpp({
          id: 'o2',
          name: 'Open later',
          stageId: 's2',
          valueMinor: 200000,
          expectedCloseDate: lastMonth(),
        }),
        makeOpp({
          id: 'o3',
          name: 'Won now',
          stageId: 's3',
          valueMinor: 550000,
          expectedCloseDate: thisMonth(12),
        }),
        makeOpp({
          id: 'o4',
          name: 'Won earlier',
          stageId: 's3',
          valueMinor: 400000,
          expectedCloseDate: lastMonth(),
        }),
        makeOpp({
          id: 'o5',
          name: 'Lost now',
          stageId: 's4',
          valueMinor: 900000,
          expectedCloseDate: thisMonth(9),
        }),
        makeOpp({
          id: 'o6',
          name: 'Unknown stage',
          stageId: 'sX',
          valueMinor: 700000,
          expectedCloseDate: thisMonth(9),
        }),
      ]),
    );
    h.getTaskSummary.mockResolvedValue({ dueToday: 3, overdue: 1 });

    renderPage();

    expect(await screen.findByText('Open now')).toBeInTheDocument();
    // Open = o1 + o2 (won/lost/unknown stages are excluded).
    expect(kpi('Open pipeline')).toEqual({ value: formatCurrency(300000), sub: '2 open deals' });
    // Only o1 closes this month; only o3 was won this month.
    expect(kpi('Closing this month')).toEqual({
      value: '1',
      sub: 'deals expected to close',
    });
    expect(kpi('Won this month')).toEqual({
      value: formatCurrency(550000),
      sub: 'closed revenue',
    });
    expect(kpi('Tasks due today')).toEqual({ value: '3', sub: 'open follow-ups' });
    // The unknown-stage deal is not listed nor counted.
    expect(section(/Open pipeline/).querySelectorAll('li')).toHaveLength(2);
    expect(screen.queryByText('Unknown stage')).not.toBeInTheDocument();
  });

  it('defaults the due-today KPI to zero when the summary is unavailable', async () => {
    h.getTaskSummary.mockRejectedValue(new Error('No summary'));

    renderPage();

    expect(await screen.findByText('No open deals in your pipeline.')).toBeInTheDocument();
    expect(kpi('Tasks due today')).toEqual({ value: '0', sub: 'open follow-ups' });
  });

  it('links the section headers to the pipeline board and the tasks page', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: /View board/ })).toHaveAttribute(
      'href',
      '/pipeline',
    );
    expect(screen.getByRole('link', { name: /All tasks/ })).toHaveAttribute('href', '/tasks');
  });

  it('requests only the current user’s tasks and the task summary once', async () => {
    renderPage();

    await screen.findByText('No open deals in your pipeline.');
    expect(h.listTasks).toHaveBeenCalledWith({ scope: 'mine' });
    expect(h.getTaskSummary).toHaveBeenCalledTimes(1);
  });

  it('lists open follow-ups sorted by due date and capped at five', async () => {
    h.listTasks.mockResolvedValue(
      listResult([
        makeTask({ id: 't1', title: 'March task', dueDate: '2030-03-03' }),
        makeTask({ id: 't2', title: 'January task', dueDate: '2030-01-01' }),
        makeTask({ id: 't3', title: 'Undated task', dueDate: undefined }),
        makeTask({ id: 't4', title: 'February task', dueDate: '2030-02-02' }),
        makeTask({ id: 't5', title: 'Completed task', dueDate: '2030-01-01', status: 'completed' }),
        makeTask({ id: 't6', title: 'May task', dueDate: '2030-05-05' }),
        makeTask({ id: 't7', title: 'June task', dueDate: '2030-06-06' }),
      ]),
    );

    renderPage();

    expect(await screen.findByText('Undated task')).toBeInTheDocument();
    const items = listItems(section(/Follow-ups/));
    // Undated sorts first, then ascending due dates; completed tasks and the
    // sixth entry are dropped.
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Undated task'),
      expect.stringContaining('January task'),
      expect.stringContaining('February task'),
      expect.stringContaining('March task'),
      expect.stringContaining('May task'),
    ]);
    expect(screen.queryByText('Completed task')).not.toBeInTheDocument();
    expect(screen.queryByText('June task')).not.toBeInTheDocument();
    // Every follow-up deep-links to the tasks page.
    expect(within(items[0]).getByRole('link')).toHaveAttribute('href', '/tasks');
  });

  it('highlights overdue follow-ups and renders a dash for missing due dates', async () => {
    h.listTasks.mockResolvedValue(
      listResult([
        makeTask({ id: 't1', title: 'Future task', dueDate: '2099-12-31' }),
        makeTask({ id: 't2', title: 'Overdue task', dueDate: '2020-03-01' }),
        makeTask({ id: 't3', title: 'Undated task', dueDate: undefined }),
      ]),
    );

    renderPage();

    expect(await screen.findByText('Overdue task')).toBeInTheDocument();
    const items = listItems(section(/Follow-ups/));
    const byTitle = (title: string) =>
      items.find((li) => li.textContent?.includes(title)) as HTMLElement;

    expect(within(byTitle('Overdue task')).getByText(formatDate('2020-03-01'))).toHaveClass(
      'text-danger',
    );
    expect(within(byTitle('Future task')).getByText(formatDate('2099-12-31'))).toHaveClass(
      'text-ink-faint',
    );
    expect(within(byTitle('Undated task')).getByText('—')).toBeInTheDocument();
  });

  it('shows the caught-up state when there are no open tasks', async () => {
    h.listTasks.mockResolvedValue(
      listResult([
        makeTask({ id: 't1', status: 'completed' }),
        makeTask({ id: 't2', status: 'completed' }),
      ]),
    );

    renderPage();

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.queryByText('Call Ada')).not.toBeInTheDocument();
  });

  it('falls back to the caught-up state when the tasks query fails', async () => {
    h.listTasks.mockRejectedValue(new Error('Boom'));

    renderPage();

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });
});
