// Component tests for TaskHistoryModal (FR-TA-03).
//
// External collaborators are mocked so the tests focus on rendering rules:
// - tasksApi.listTaskCompletions -> loading / data / empty / error states
// - MetaContext.useMeta          -> resolves `completedBy` into a display name
//
// `lib/hooks`.useQuery stays real so loading/error states are genuine, and the
// real Modal is used so dismissal affordances are covered too.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime } from '../../lib/format';
import type { TaskCompletionEntry } from './tasksApi';
import { TaskHistoryModal } from './TaskHistoryModal';

const h = vi.hoisted(() => ({
  listTaskCompletions: vi.fn(),
  useMeta: vi.fn(),
}));

vi.mock('./tasksApi', () => ({ listTaskCompletions: h.listTaskCompletions }));
vi.mock('../meta/MetaContext', () => ({ useMeta: h.useMeta }));

const onClose = vi.fn();

function entry(overrides: Partial<TaskCompletionEntry> = {}): TaskCompletionEntry {
  return {
    id: 'tc1',
    taskId: 't1',
    completedAt: '2026-08-25T10:15:00.000Z',
    completedBy: 'u1',
    ...overrides,
  };
}

function completions(items: TaskCompletionEntry[]) {
  return { items, total: items.length };
}

function renderModal(taskId = 't1', taskTitle = 'Send proposal') {
  return render(<TaskHistoryModal taskId={taskId} taskTitle={taskTitle} onClose={onClose} />);
}

describe('TaskHistoryModal', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    h.useMeta.mockReturnValue({
      userName: (id?: string) => (id === 'u1' ? 'Ada Lovelace' : 'Unknown'),
    });
    h.listTaskCompletions.mockResolvedValue(completions([entry()]));
  });

  it('requests the completion history for the task and shows the loading state', async () => {
    let resolveList!: (value: { items: TaskCompletionEntry[]; total: number }) => void;
    h.listTaskCompletions.mockImplementationOnce(
      () => new Promise((resolve) => (resolveList = resolve)),
    );

    renderModal();

    expect(await screen.findByText('Loading history…')).toBeInTheDocument();
    expect(h.listTaskCompletions).toHaveBeenCalledWith('t1');

    resolveList(completions([]));

    expect(await screen.findByText('No completions yet')).toBeInTheDocument();
  });

  it('titles the dialog with the task it belongs to', async () => {
    renderModal('t1', 'Negotiate terms');

    expect(
      await screen.findByRole('heading', { name: 'Completion history — Negotiate terms' }),
    ).toBeInTheDocument();
  });

  it('renders one list entry per completion with the resolved user and timestamp', async () => {
    h.listTaskCompletions.mockResolvedValue(
      completions([
        entry({ id: 'tc2', completedAt: '2026-08-26T08:00:00.000Z', completedBy: 'u1' }),
        entry({ id: 'tc1', completedAt: '2026-08-25T10:15:00.000Z', completedBy: 'u1' }),
      ]),
    );

    renderModal();

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Ada Lovelace');
    expect(items[0]).toHaveTextContent(formatDateTime('2026-08-26T08:00:00.000Z'));
    expect(items[1]).toHaveTextContent(formatDateTime('2026-08-25T10:15:00.000Z'));
  });

  it('falls back to Unknown for a completer that is not in the metadata', async () => {
    h.listTaskCompletions.mockResolvedValue(completions([entry({ completedBy: 'u-gone' })]));

    renderModal();

    expect(await screen.findByText('Unknown')).toBeInTheDocument();
  });

  it('shows an empty state when the task was never completed', async () => {
    h.listTaskCompletions.mockResolvedValue(completions([]));

    renderModal();

    expect(await screen.findByText('No completions yet')).toBeInTheDocument();
    expect(screen.getByText('This task has not been completed so far.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('surfaces the failure message when the request rejects', async () => {
    h.listTaskCompletions.mockRejectedValueOnce(new Error('Failed to load history'));

    renderModal();

    expect(await screen.findByText('Failed to load history')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('falls back to a generic message for non-Error failures', async () => {
    h.listTaskCompletions.mockRejectedValueOnce('nope');

    renderModal();

    expect(await screen.findByText('Request failed')).toBeInTheDocument();
  });

  it('reloads when it is reopened for a different task', async () => {
    const { rerender } = renderModal('t1');

    await screen.findByText('Completed by', { exact: false });

    rerender(<TaskHistoryModal taskId="t2" taskTitle="Send proposal" onClose={onClose} />);

    await waitFor(() => expect(h.listTaskCompletions).toHaveBeenCalledWith('t2'));
  });

  describe('dismissal', () => {
    it('closes from the dialog close control and on Escape', async () => {
      const user = userEvent.setup();
      renderModal();

      await screen.findByText('Completed by', { exact: false });

      await user.click(screen.getByRole('button', { name: 'Close' }));
      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });
});
