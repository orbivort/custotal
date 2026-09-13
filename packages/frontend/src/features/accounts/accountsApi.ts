// Accounts API: owns every /api/accounts* endpoint and the types they exchange.
import { api, toQueryString } from '../../lib/api';
import type { Account, AccountDetailPayload, Contact, PaginatedResult } from '../../types/domain';

export interface AccountListParams {
  q?: string;
  owner?: string;
  /** First-letter filter on the account name (single A-Z character). */
  letter?: string;
  /** 'name' | 'name_desc' | 'updated' | 'updated_desc' (default 'updated_desc'). */
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** Writable fields for creating/updating an account. */
export interface AccountInput {
  name?: string;
  industry?: string;
  website?: string;
  phone?: string;
  billingAddress?: string;
  notes?: string;
  ownerId?: string;
}

/** Update payload: `updatedAt` is the optimistic-lock conflict token. */
export interface AccountUpdateInput extends AccountInput {
  updatedAt?: string;
}

export interface AccountLinkInput {
  contactId: string;
  primary?: boolean;
  role?: string;
}

export async function listAccounts(params: AccountListParams): Promise<PaginatedResult<Account>> {
  return api.get<PaginatedResult<Account>>(`/api/accounts${toQueryString(params)}`);
}

export async function getAccount(id: string): Promise<AccountDetailPayload> {
  return api.get<AccountDetailPayload>(`/api/accounts/${id}`);
}

export async function createAccount(input: AccountInput): Promise<Account> {
  return api.post<Account>('/api/accounts', input);
}

export async function updateAccount(id: string, input: AccountUpdateInput): Promise<Account> {
  return api.patch<Account>(`/api/accounts/${id}`, input);
}

export async function deleteAccount(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/accounts/${id}`);
}

/** Links a contact to an account (or updates an existing link). */
export async function addAccountLink(accountId: string, input: AccountLinkInput): Promise<Contact> {
  return api.post<Contact>(`/api/accounts/${accountId}/links`, input);
}

/** Removes the account link from a contact. */
export async function removeAccountLink(accountId: string, contactId: string): Promise<Contact> {
  return api.del<Contact>(`/api/accounts/${accountId}/links/${contactId}`);
}
