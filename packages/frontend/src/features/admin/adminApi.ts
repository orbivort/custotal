// Admin API: users, pipeline stages, and trash/recovery under /api/admin.
import { api } from '../../lib/api';
import type {
  Account,
  Contact,
  Interaction,
  Opportunity,
  Role,
  Stage,
  StageClassification,
  Task,
  TrashPayload,
  User,
} from '../../types/domain';

// ---- Users -----------------------------------------------------------------

export interface UserInput {
  name: string;
  email: string;
  role: Role;
}

export interface UserUpdateInput {
  name?: string;
  email?: string;
  role?: Role;
}

export interface CreateUserResult {
  user: User;
  /** True when the invitation email was delivered. */
  inviteSent: boolean;
  /**
   * One-time temporary credential — present ONLY when the invitation email
   * could not be delivered. Must be shared out-of-band and is rotated at
   * first sign-in.
   */
  tempPassword?: string;
}

export async function listUsers(): Promise<User[]> {
  const res = await api.get<{ items: User[] }>('/api/admin/users');
  return res.items;
}

export async function createUser(input: UserInput): Promise<CreateUserResult> {
  return api.post<CreateUserResult>('/api/admin/users', input);
}

export async function updateUser(id: string, input: UserUpdateInput): Promise<User> {
  return api.patch<User>(`/api/admin/users/${id}`, input);
}

export async function deleteUser(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/admin/users/${id}`);
}

// ---- Pipeline stages ---------------------------------------------------------

export interface StageInput {
  name?: string;
  winProbability?: number;
  classification?: StageClassification;
}

export async function createStage(input: StageInput): Promise<Stage> {
  return api.post<Stage>('/api/admin/stages', input);
}

export async function updateStage(id: string, input: StageInput): Promise<Stage> {
  return api.patch<Stage>(`/api/admin/stages/${id}`, input);
}

export async function deleteStage(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/admin/stages/${id}`);
}

/** Reorders the pipeline; returns the stages in their new order. */
export async function reorderStages(orderedIds: string[]): Promise<Stage[]> {
  const res = await api.post<{ items: Stage[] }>('/api/admin/stages/reorder', { orderedIds });
  return res.items;
}

// ---- Trash / recovery -------------------------------------------------------

export async function listTrash(): Promise<TrashPayload> {
  return api.get<TrashPayload>('/api/admin/trash');
}

export async function restoreTrashContact(id: string): Promise<Contact> {
  return api.post<Contact>(`/api/admin/trash/contacts/${id}/restore`);
}

export async function restoreTrashAccount(id: string): Promise<Account> {
  return api.post<Account>(`/api/admin/trash/accounts/${id}/restore`);
}

export async function purgeTrashContact(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/admin/trash/contacts/${id}`);
}

export async function purgeTrashAccount(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/admin/trash/accounts/${id}`);
}

export async function restoreTrashOpportunity(id: string): Promise<Opportunity> {
  return api.post<Opportunity>(`/api/admin/trash/opportunities/${id}/restore`);
}

export async function restoreTrashTask(id: string): Promise<Task> {
  return api.post<Task>(`/api/admin/trash/tasks/${id}/restore`);
}

export async function restoreTrashInteraction(id: string): Promise<Interaction> {
  return api.post<Interaction>(`/api/admin/trash/interactions/${id}/restore`);
}

export async function purgeTrashOpportunity(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/admin/trash/opportunities/${id}`);
}

export async function purgeTrashTask(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/admin/trash/tasks/${id}`);
}

export async function purgeTrashInteraction(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/admin/trash/interactions/${id}`);
}
