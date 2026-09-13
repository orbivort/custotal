// Component tests for PipelineReportPage.
//
// External collaborators are mocked so the tests focus on page behavior:
// - reportsApi.fetchPipelineReport -> loading / data / error states
// - MetaContext.useMeta            -> owner list for the filter
// - SessionContext.useSession      -> role gate for the owner filter
// - lib/csv                        -> download/toCsv interception (no Blob in jsdom)
//
// lib/format, lib/hooks (useQuery) and BarChart are intentionally left real so
// currency formatting, the fetch/re-render cycle, and the chart are covered
// end to end rather than assumed.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCurrency, valueLabel } from '../../lib/format';
import type { PipelineReportPayload, Role, User } from '../../types/domain';
import PipelineReportPage from './PipelineReportPage';

const h = vi.hoisted(() => ({
  fetchPipelineReport: vi.fn(),
  useMeta: vi.fn(),
  useSession: vi.fn(),
  toCsv: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock('./reportsApi', () => ({ fetchPipelineReport: h.fetchPipelineReport }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../auth/SessionContext', () => ({ useSession: h.useSession }));
vi.mock('../../lib/csv', () => ({ toCsv: h.toCsv, downloadCsv: h.downloadCsv }));

const USERS: User[] = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { id: 'u2', name: 'Ben Smith', email: 'ben@example.com', role: 'rep' },
];

const ROWS: PipelineReportPayload['rows'] = [
  { stageId: 's1', stageName: 'Discovery', count: 3, totalValue: 150000, weightedValue: 30000 },
  { stageId: 's2', stageName: 'Proposal', count: 1, totalValue: 50000, weightedValue: 30000 },
];

const PAYLOAD: PipelineReportPayload = { rows: ROWS };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <PipelineReportPage />
    </MemoryRouter>,
  );
}

/** Cell text of every body row, in render order. */
function tableRows(): string[][] {
  const tbody = screen.getByRole('table').querySelector('tbody');
  if (!tbody) throw new Error('No table body rendered');
  return Array.from(tbody.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent ?? ''),
  );
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

describe('PipelineReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSessionRole('admin');
    h.useMeta.mockReturnValue({ users: USERS });
    h.toCsv.mockReturnValue('csv-content');
    h.fetchPipelineReport.mockResolvedValue(PAYLOAD);
  });

  describe('data loading', () => {
    it('requests the unfiltered report on first render', async () => {
      renderPage();

      // Awaited via the table: stage names also appear as chart axis labels.
      await screen.findByRole('table');
      expect(h.fetchPipelineReport).toHaveBeenCalledWith({ owner: '', from: '', to: '' });
    });

    it('shows the loading block while the report is in flight', async () => {
      let resolveReport!: (value: PipelineReportPayload) => void;
      h.fetchPipelineReport.mockImplementationOnce(
        () => new Promise<PipelineReportPayload>((resolve) => (resolveReport = resolve)),
      );

      renderPage();

      expect(await screen.findByText('Loading…')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();

      resolveReport(PAYLOAD);
      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });

    it('surfaces the failure message and hides the table when the request fails', async () => {
      h.fetchPipelineReport.mockRejectedValueOnce(new Error('Report unavailable'));

      renderPage();

      expect(await screen.findByText('Report unavailable')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });

    it('falls back to a generic message for non-Error failures', async () => {
      h.fetchPipelineReport.mockRejectedValueOnce('boom');

      renderPage();

      expect(await screen.findByText('Request failed')).toBeInTheDocument();
    });
  });

  describe('report rendering', () => {
    it('renders one row per stage with count, total value, and weighted value', async () => {
      renderPage();

      await screen.findByRole('table');
      expect(tableRows()).toEqual([
        ['Discovery', '3', formatCurrency(150000), formatCurrency(30000)],
        ['Proposal', '1', formatCurrency(50000), formatCurrency(30000)],
      ]);
    });

    it('renders the bar chart of total value per stage', async () => {
      renderPage();

      expect(await screen.findByRole('img', { name: 'Bar chart' })).toBeInTheDocument();
    });

    it('renders an empty table (but still a chart) when the report has no rows', async () => {
      h.fetchPipelineReport.mockResolvedValue({ rows: [] });

      renderPage();

      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
      expect(tableRows()).toEqual([]);
      expect(screen.getByRole('img', { name: 'Bar chart' })).toBeInTheDocument();
      expect(exportButton()).toBeDisabled();
    });

    it('links to the win/loss report from the sub navigation', async () => {
      renderPage();

      // Awaited via the table: stage names also appear as chart axis labels.
      await screen.findByRole('table');
      expect(screen.getByRole('link', { name: 'Win / Loss' })).toHaveAttribute(
        'href',
        '/reports/winloss',
      );
      expect(screen.getByRole('link', { name: 'Pipeline by stage' })).toHaveAttribute(
        'href',
        '/reports/pipeline',
      );
    });
  });

  describe('filters', () => {
    it('re-fetches when an owner is selected', async () => {
      const user = userEvent.setup();
      renderPage();
      // Awaited via the table: stage names also appear as chart axis labels.
      await screen.findByRole('table');

      await user.selectOptions(screen.getByLabelText('Filter by owner'), 'u2');

      await waitFor(() =>
        expect(h.fetchPipelineReport).toHaveBeenCalledWith({ owner: 'u2', from: '', to: '' }),
      );
    });

    it('re-fetches when the close-date range changes', async () => {
      renderPage();
      // Awaited via the table: stage names also appear as chart axis labels.
      await screen.findByRole('table');

      fireEvent.change(screen.getByLabelText('Close date from'), {
        target: { value: '2026-01-01' },
      });
      await waitFor(() =>
        expect(h.fetchPipelineReport).toHaveBeenCalledWith({
          owner: '',
          from: '2026-01-01',
          to: '',
        }),
      );

      fireEvent.change(screen.getByLabelText('Close date to'), { target: { value: '2026-03-31' } });
      await waitFor(() =>
        expect(h.fetchPipelineReport).toHaveBeenCalledWith({
          owner: '',
          from: '2026-01-01',
          to: '2026-03-31',
        }),
      );
    });

    it('offers every user plus an "all owners" option', async () => {
      renderPage();

      const select = await screen.findByLabelText('Filter by owner');
      expect(select).toHaveValue('');
      expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
        'All owners',
        'Ada Lovelace',
        'Ben Smith',
      ]);
      expect(
        Array.from(select.querySelectorAll('option')).map((o) => o.getAttribute('value')),
      ).toEqual(['', 'u1', 'u2']);
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

      // Awaited via the table: stage names also appear as chart axis labels.
      await screen.findByRole('table');
      expect(screen.queryByLabelText('Filter by owner')).not.toBeInTheDocument();
    });

    it('keeps the date filters available to every role', async () => {
      setSessionRole('rep');
      renderPage();

      expect(await screen.findByLabelText('Close date from')).toBeInTheDocument();
      expect(screen.getByLabelText('Close date to')).toBeInTheDocument();
    });
  });

  describe('CSV export', () => {
    it('exports the stage rows with currency values converted from minor units', async () => {
      const user = userEvent.setup();
      renderPage();
      // Awaited via the table: stage names also appear as chart axis labels.
      await screen.findByRole('table');

      await user.click(exportButton());

      await waitFor(() =>
        expect(h.downloadCsv).toHaveBeenCalledWith('pipeline-by-stage.csv', 'csv-content'),
      );
      expect(h.toCsv).toHaveBeenCalledWith(
        ['Stage', 'Count', valueLabel('Total value'), valueLabel('Weighted value')],
        [
          ['Discovery', 3, '1500.00', '300.00'],
          ['Proposal', 1, '500.00', '300.00'],
        ],
      );
    });

    it('keeps the export button disabled while there is nothing to export', async () => {
      h.fetchPipelineReport.mockResolvedValue({ rows: [] });
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => expect(exportButton()).toBeDisabled());
      await user.click(exportButton());

      expect(h.downloadCsv).not.toHaveBeenCalled();
    });

    it('keeps the export button disabled while loading', async () => {
      h.fetchPipelineReport.mockImplementationOnce(() => new Promise(() => undefined));
      renderPage();

      expect(await screen.findByText('Loading…')).toBeInTheDocument();
      expect(exportButton()).toBeDisabled();
    });
  });
});
