// Component tests for WinLossReportPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - reportsApi.fetchWinLossReport -> loading / data / error states
// - MetaContext.useMeta           -> owner list for the filter
// - SessionContext.useSession     -> role gate for the owner filter
// - lib/csv                       -> download/toCsv interception (no Blob in jsdom)
//
// lib/format, lib/hooks (useQuery) and BarChart are intentionally left real so
// currency/percent formatting, the fetch/re-render cycle, and the chart are
// covered end to end rather than assumed.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCurrency, valueLabel } from '../../lib/format';
import type { Role, User, WinLossReportPayload } from '../../types/domain';
import WinLossReportPage from './WinLossReportPage';

const h = vi.hoisted(() => ({
  fetchWinLossReport: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  toCsv: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock('./reportsApi', () => ({ fetchWinLossReport: h.fetchWinLossReport }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../lib/csv', () => ({ toCsv: h.toCsv, downloadCsv: h.downloadCsv }));

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

const PAYLOAD: WinLossReportPayload = {
  wonCount: 4,
  lostCount: 6,
  wonValue: 400000,
  lostValue: 600000,
  winRate: 40,
  lossReasons: [
    { reason: 'Price', count: 4 },
    { reason: 'Timing', count: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <WinLossReportPage />
    </MemoryRouter>,
  );
}

/** Value shown in the summary card carrying the given label. */
function card(label: string): string {
  const node = screen.getByText(label);
  return node.nextElementSibling?.textContent ?? '';
}

/** Text of every loss-reason list item, in render order. */
function lossReasonItems(): string[] {
  const list = screen.getByRole('list');
  return Array.from(list.querySelectorAll('li')).map((li) => li.textContent ?? '');
}

function exportButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Export CSV' });
}

function setSessionRole(role: Role) {
  h.useSession.mockReturnValue({
    user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role },
  });
}

// Vitest runs without `globals: true`, so @testing-library/react cannot register
// its automatic afterEach cleanup; unmount between tests explicitly.
afterEach(() => cleanup());

describe('WinLossReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSessionRole('admin');
    h.useMeta.mockReturnValue({ users: USERS });
    h.toCsv.mockReturnValue('csv-content');
    h.fetchWinLossReport.mockResolvedValue(PAYLOAD);
  });

  describe('data loading', () => {
    it('requests the unfiltered report on first render', async () => {
      renderPage();

      await screen.findByText('Closed value');
      expect(h.fetchWinLossReport).toHaveBeenCalledWith({ owner: '', from: '', to: '' });
    });

    it('shows the loading block while the report is in flight', async () => {
      let resolveReport!: (value: WinLossReportPayload) => void;
      h.fetchWinLossReport.mockImplementationOnce(
        () => new Promise<WinLossReportPayload>((resolve) => (resolveReport = resolve)),
      );

      renderPage();

      expect(await screen.findByText('Loading…')).toBeInTheDocument();
      expect(screen.queryByText('Closed value')).not.toBeInTheDocument();

      resolveReport(PAYLOAD);
      expect(await screen.findByText('Closed value')).toBeInTheDocument();
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });

    it('surfaces the failure message and hides the summary when the request fails', async () => {
      h.fetchWinLossReport.mockRejectedValueOnce(new Error('Report unavailable'));

      renderPage();

      expect(await screen.findByText('Report unavailable')).toBeInTheDocument();
      expect(screen.queryByText('Closed value')).not.toBeInTheDocument();
      expect(screen.queryByText('Loss reasons')).not.toBeInTheDocument();
    });

    it('falls back to a generic message for non-Error failures', async () => {
      h.fetchWinLossReport.mockRejectedValueOnce('boom');

      renderPage();

      expect(await screen.findByText('Request failed')).toBeInTheDocument();
    });
  });

  describe('summary', () => {
    it('shows won/lost counts, win rate, and both closed values', async () => {
      renderPage();

      await screen.findByText('Closed value');
      expect(card('Won deals')).toBe('4');
      expect(card('Lost deals')).toBe('6');
      expect(card('Win rate')).toBe('40%');
      expect(card('Won value')).toBe(formatCurrency(400000));
      expect(card('Lost value')).toBe(formatCurrency(600000));
    });

    it('renders the closed-value bar chart once data is available', async () => {
      renderPage();

      expect(await screen.findByRole('img', { name: 'Bar chart' })).toBeInTheDocument();
    });

    it('renders the loss-reason breakdown with pluralized counts', async () => {
      renderPage();

      await screen.findByText('Closed value');
      expect(lossReasonItems()).toEqual(['Price4 deals', 'Timing1 deal']);
    });

    it('reports no losses when the breakdown is empty', async () => {
      h.fetchWinLossReport.mockResolvedValue({ ...PAYLOAD, lostCount: 0, lossReasons: [] });

      renderPage();

      expect(await screen.findByText('No losses recorded in this period.')).toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('shows zeroed summary and no chart when the response carries no payload', async () => {
      h.fetchWinLossReport.mockResolvedValue(null);

      renderPage();

      await waitFor(() => expect(screen.getByText('Loss reasons')).toBeInTheDocument());
      expect(card('Won deals')).toBe('0');
      expect(card('Lost deals')).toBe('0');
      expect(card('Win rate')).toBe('0%');
      expect(card('Won value')).toBe(formatCurrency(0));
      expect(card('Lost value')).toBe(formatCurrency(0));
      expect(screen.queryByRole('img', { name: 'Bar chart' })).not.toBeInTheDocument();
      expect(exportButton()).toBeDisabled();
    });
  });

  describe('filters', () => {
    it('re-fetches when an owner is selected', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Closed value');

      await user.selectOptions(screen.getByLabelText('Filter by owner'), 'u2');

      await waitFor(() =>
        expect(h.fetchWinLossReport).toHaveBeenCalledWith({ owner: 'u2', from: '', to: '' }),
      );
    });

    it('re-fetches when the close-date range changes', async () => {
      renderPage();
      await screen.findByText('Closed value');

      fireEvent.change(screen.getByLabelText('Close date from'), {
        target: { value: '2026-01-01' },
      });
      await waitFor(() =>
        expect(h.fetchWinLossReport).toHaveBeenCalledWith({
          owner: '',
          from: '2026-01-01',
          to: '',
        }),
      );

      fireEvent.change(screen.getByLabelText('Close date to'), { target: { value: '2026-03-31' } });
      await waitFor(() =>
        expect(h.fetchWinLossReport).toHaveBeenCalledWith({
          owner: '',
          from: '2026-01-01',
          to: '2026-03-31',
        }),
      );
    });

    it.each(['manager', 'admin', 'readonly'] as const)(
      'shows the owner filter for role %s',
      async (role) => {
        setSessionRole(role);
        renderPage();

        expect(await screen.findByLabelText('Filter by owner')).toBeInTheDocument();
      },
    );

    it('hides the owner filter for reps (owner-scoped users)', async () => {
      setSessionRole('rep');
      renderPage();

      await screen.findByText('Closed value');
      expect(screen.queryByLabelText('Filter by owner')).not.toBeInTheDocument();
    });

    it('keeps the date filters available to every role', async () => {
      setSessionRole('rep');
      renderPage();

      expect(await screen.findByLabelText('Close date from')).toBeInTheDocument();
      expect(screen.getByLabelText('Close date to')).toBeInTheDocument();
    });

    it('links to the pipeline report from the sub navigation', async () => {
      renderPage();

      await screen.findByText('Closed value');
      expect(screen.getByRole('link', { name: 'Pipeline by stage' })).toHaveAttribute(
        'href',
        '/reports/pipeline',
      );
      expect(screen.getByRole('link', { name: 'Win / Loss' })).toHaveAttribute(
        'href',
        '/reports/winloss',
      );
    });
  });

  describe('CSV export', () => {
    it('exports the summary metrics followed by the loss-reason breakdown', async () => {
      const user = userEvent.setup();
      h.toCsv.mockReturnValueOnce('summary-csv').mockReturnValueOnce('reasons-csv');
      renderPage();
      await screen.findByText('Closed value');

      await user.click(exportButton());

      await waitFor(() =>
        expect(h.downloadCsv).toHaveBeenCalledWith(
          'win-loss-report.csv',
          'summary-csv\r\n\r\nLoss reasons\r\nreasons-csv',
        ),
      );
      expect(h.toCsv).toHaveBeenNthCalledWith(
        1,
        ['Metric', 'Value'],
        [
          ['Won deals', 4],
          ['Lost deals', 6],
          ['Win rate', '40%'],
          [valueLabel('Won value'), '4000.00'],
          [valueLabel('Lost value'), '6000.00'],
        ],
      );
      expect(h.toCsv).toHaveBeenNthCalledWith(
        2,
        ['Reason', 'Count'],
        [
          ['Price', 4],
          ['Timing', 1],
        ],
      );
    });

    it('exports an empty breakdown when there were no losses', async () => {
      const user = userEvent.setup();
      h.fetchWinLossReport.mockResolvedValue({ ...PAYLOAD, lossReasons: [] });
      renderPage();
      await screen.findByText('No losses recorded in this period.');

      await user.click(exportButton());

      await waitFor(() => expect(h.downloadCsv).toHaveBeenCalled());
      expect(h.toCsv).toHaveBeenNthCalledWith(2, ['Reason', 'Count'], []);
    });

    it('keeps the export button disabled while there is no data', async () => {
      const user = userEvent.setup();
      h.fetchWinLossReport.mockResolvedValue(null);
      renderPage();

      await waitFor(() => expect(exportButton()).toBeDisabled());
      await user.click(exportButton());

      expect(h.downloadCsv).not.toHaveBeenCalled();
      expect(h.toCsv).not.toHaveBeenCalled();
    });

    it('keeps the export button disabled while loading', async () => {
      h.fetchWinLossReport.mockImplementationOnce(() => new Promise(() => undefined));
      renderPage();

      expect(await screen.findByText('Loading…')).toBeInTheDocument();
      expect(exportButton()).toBeDisabled();
    });
  });
});
