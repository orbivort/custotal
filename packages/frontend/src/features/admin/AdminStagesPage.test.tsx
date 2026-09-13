// Component tests for AdminStagesPage (stage list, reorder, create, edit, delete).
//
// Collaborators are mocked so the tests focus on page behavior:
// - MetaContext.useMeta        -> stage list + metadata refresh after mutations
// - pipeline/opportunitiesApi.listOpportunities -> deal occupancy per stage
// - adminApi.createStage/updateStage/deleteStage/reorderStages -> mutations
// - toast.useToast             -> feedback for every mutation
// The real useQuery hook drives the opportunities fetch like in the app.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import type { ListResult, Opportunity, Stage } from '../../types/domain';
import AdminStagesPage from './AdminStagesPage';

const h = vi.hoisted(() => ({
  listOpportunities: vi.fn(),
  createStage: vi.fn(),
  updateStage: vi.fn(),
  deleteStage: vi.fn(),
  reorderStages: vi.fn(),
  useMeta: vi.fn(),
  refresh: vi.fn(),
  show: vi.fn(),
}));

vi.mock('./adminApi', () => ({
  createStage: h.createStage,
  updateStage: h.updateStage,
  deleteStage: h.deleteStage,
  reorderStages: h.reorderStages,
}));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));
vi.mock('../meta/useEnsureStages', () => ({ useEnsureStages: vi.fn() }));
vi.mock('../pipeline/opportunitiesApi', () => ({ listOpportunities: h.listOpportunities }));
vi.mock('../../components/toast', () => ({ useToast: () => ({ show: h.show }) }));

const STAGES: Stage[] = [
  { id: 's4', name: 'Closed lost', order: 4, winProbability: 0, classification: 'lost' },
  { id: 's1', name: 'Discovery', order: 1, winProbability: 20, classification: 'open' },
  { id: 's3', name: 'Closed won', order: 3, winProbability: 100, classification: 'won' },
  { id: 's2', name: 'Proposal', order: 2, winProbability: 50, classification: 'open' },
];

function makeOpportunity(stageId: string): Opportunity {
  return {
    id: `o-${stageId}`,
    name: `Deal in ${stageId}`,
    accountId: 'a1',
    valueMinor: 1000,
    currency: 'USD',
    expectedCloseDate: '2026-06-30',
    stageId,
    probability: 50,
    probabilityManual: false,
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-02T00:00:00Z',
    updatedBy: 'u1',
  };
}

function oppResult(stageIds: string[]): ListResult<Opportunity> {
  return { items: stageIds.map(makeOpportunity), total: stageIds.length };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminStagesPage />
    </MemoryRouter>,
  );
}

describe('AdminStagesPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({ stages: STAGES, refresh: h.refresh });
    h.listOpportunities.mockResolvedValue(oppResult(['s1']));
    h.refresh.mockResolvedValue(undefined);
    h.createStage.mockResolvedValue({
      id: 's9',
      name: 'Pilot',
      order: 5,
      winProbability: 10,
      classification: 'open',
    });
    h.updateStage.mockResolvedValue({
      id: 's1',
      name: 'Discovery',
      order: 1,
      winProbability: 20,
      classification: 'open',
    });
    h.deleteStage.mockResolvedValue(undefined);
    h.reorderStages.mockResolvedValue(STAGES);
  });

  it('shows the loading state while opportunities are fetched, then the sorted stages', async () => {
    let resolveOpps!: (value: ListResult<Opportunity>) => void;
    h.listOpportunities.mockImplementationOnce(
      () => new Promise<ListResult<Opportunity>>((resolve) => (resolveOpps = resolve)),
    );

    renderPage();

    expect(await screen.findByText('Loading pipeline…')).toBeInTheDocument();

    resolveOpps(oppResult(['s1']));
    await screen.findByText('Discovery');
  });

  it('renders stages sorted by order with classification, probability, and position', async () => {
    renderPage();

    expect(await screen.findByText('Discovery')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Discovery');
    expect(rows[0]).toHaveTextContent('#1 in pipeline order');
    expect(rows[3]).toHaveTextContent('Closed lost');
    expect(rows[3]).toHaveTextContent('#4 in pipeline order');

    expect(screen.getAllByText('Open')).toHaveLength(2);
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('locks stages holding deals and disables their delete button', async () => {
    renderPage();

    expect(await screen.findByText('Discovery')).toBeInTheDocument();
    expect(screen.getByText('1 deal')).toBeInTheDocument();
    expect(screen.getAllByText('0 deals')).toHaveLength(3);

    // Discovery holds one deal: lock icon is shown and delete is disabled.
    expect(screen.getByRole('button', { name: 'Delete Discovery' })).toBeDisabled();
    // Proposal holds no deals: delete stays enabled.
    expect(screen.getByRole('button', { name: 'Delete Proposal' })).toBeEnabled();
  });

  it('disables moving the first stage up and the last stage down', async () => {
    renderPage();

    expect(await screen.findByText('Discovery')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Discovery up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Discovery down' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Closed lost down' })).toBeDisabled();
  });

  it('reorders stages when a stage is moved down and refreshes meta', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Discovery');

    await user.click(screen.getByRole('button', { name: 'Move Discovery down' }));

    await waitFor(() => expect(h.reorderStages).toHaveBeenCalledWith(['s2', 's1', 's3', 's4']));
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it('reorders stages when a stage is moved up', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Discovery');

    await user.click(screen.getByRole('button', { name: 'Move Closed lost up' }));

    await waitFor(() => expect(h.reorderStages).toHaveBeenCalledWith(['s1', 's2', 's4', 's3']));
  });

  it('toasts the failure when a reorder is rejected', async () => {
    const user = userEvent.setup();
    h.reorderStages.mockRejectedValueOnce(new Error('Reorder conflict'));
    renderPage();
    await screen.findByText('Discovery');

    await user.click(screen.getByRole('button', { name: 'Move Discovery down' }));

    await waitFor(() => expect(h.show).toHaveBeenCalledWith('Reorder conflict', 'error'));
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('creates a stage from the modal and refreshes meta', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Discovery');

    await user.click(screen.getByRole('button', { name: /New stage/ }));

    const dialog = await screen.findByRole('dialog', { name: 'New stage' });
    expect(dialog).toHaveTextContent('New stages append at the end of the pipeline (position 5).');

    await user.type(screen.getByLabelText(/Stage name/), 'Pilot');
    const probability = screen.getByLabelText(/Default win probability/);
    await user.clear(probability);
    await user.type(probability, '40');
    await user.selectOptions(screen.getByLabelText(/^Classification/), 'won');
    await user.click(screen.getByRole('button', { name: 'Add stage' }));

    await waitFor(() =>
      expect(h.createStage).toHaveBeenCalledWith({
        name: 'Pilot',
        winProbability: 40,
        classification: 'won',
      }),
    );
    expect(h.show).toHaveBeenCalledWith('Stage created', 'success');
    expect(h.refresh).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New stage' })).not.toBeInTheDocument(),
    );
  });

  it('maps validation details onto the new-stage form', async () => {
    const user = userEvent.setup();
    h.createStage.mockRejectedValueOnce(
      new ApiError('validation', 'Invalid', [
        { field: 'name', message: 'Stage name is required.' },
      ]),
    );
    renderPage();
    await screen.findByText('Discovery');

    await user.click(screen.getByRole('button', { name: /New stage/ }));
    await user.click(screen.getByRole('button', { name: 'Add stage' }));

    expect(await screen.findByText('Stage name is required.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New stage' })).toBeInTheDocument();
  });

  it('prefills and saves the edit form', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Discovery');

    await user.click(screen.getByRole('button', { name: 'Edit Discovery' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit stage' });
    expect(dialog).not.toHaveTextContent('New stages append');
    expect(screen.getByLabelText(/Stage name/)).toHaveValue('Discovery');
    // <input type="number"> values are exposed as numbers in jsdom.
    expect(screen.getByLabelText(/Default win probability/)).toHaveValue(20);
    expect(screen.getByLabelText(/^Classification/)).toHaveValue('open');

    const name = screen.getByLabelText(/Stage name/);
    await user.clear(name);
    await user.type(name, 'Discovery call');
    const probability = screen.getByLabelText(/Default win probability/);
    await user.clear(probability);
    await user.type(probability, '35');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(h.updateStage).toHaveBeenCalledWith('s1', {
        name: 'Discovery call',
        winProbability: 35,
        classification: 'open',
      }),
    );
    expect(h.show).toHaveBeenCalledWith('Stage updated', 'success');
    expect(h.refresh).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit stage' })).not.toBeInTheDocument(),
    );
  });

  it('deletes a stage after confirmation and refreshes meta', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Discovery');

    await user.click(screen.getByRole('button', { name: 'Delete Proposal' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete stage' });
    expect(dialog).toHaveTextContent('Delete stage "Proposal"? This cannot be undone.');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(h.deleteStage).toHaveBeenCalledWith('s2'));
    expect(h.show).toHaveBeenCalledWith('Stage deleted', 'success');
    expect(h.refresh).toHaveBeenCalled();
  });

  it('keeps the stage when deletion is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Discovery');

    await user.click(screen.getByRole('button', { name: 'Delete Proposal' }));
    await screen.findByRole('dialog', { name: 'Delete stage' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(h.deleteStage).not.toHaveBeenCalled();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
  });
});
