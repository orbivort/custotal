// Tasks API: owns every /api/tasks* endpoint.
import { api, toQueryString } from '../../lib/api';
import type { ListResult, Task, TaskPriority, TaskStatus, TaskSummary } from '../../types/domain';

export interface TaskListParams {
  scope?: 'mine' | 'all';
  status?: string;
  priority?: string;
  owner?: string;
  related?: string;
}

/** Writable fields for creating/updating a task. */
export interface TaskInput {
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  assigneeId?: string;
  contactId?: string;
  accountId?: string;
  opportunityId?: string;
}

export async function listTasks(params: TaskListParams): Promise<ListResult<Task>> {
  return api.get<ListResult<Task>>(`/api/tasks${toQueryString(params)}`);
}

export async function getTaskSummary(): Promise<TaskSummary> {
  return api.get<TaskSummary>('/api/tasks/summary');
}

export async function createTask(input: TaskInput): Promise<Task> {
  return api.post<Task>('/api/tasks', input);
}

export async function updateTask(id: string, input: TaskInput): Promise<Task> {
  return api.patch<Task>(`/api/tasks/${id}`, input);
}

export async function deleteTask(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/tasks/${id}`);
}

export async function completeTask(id: string): Promise<Task> {
  return api.post<Task>(`/api/tasks/${id}/complete`);
}

export async function reopenTask(id: string): Promise<Task> {
  return api.post<Task>(`/api/tasks/${id}/reopen`);
}

/** Append-only completion history for a task (FR-TA-03), newest first. */
export interface TaskCompletionEntry {
  id: string;
  taskId: string;
  completedAt: string;
  completedBy: string;
}

export async function listTaskCompletions(
  id: string,
): Promise<{ items: TaskCompletionEntry[]; total: number }> {
  return api.get(`/api/tasks/${id}/completions`);
}
