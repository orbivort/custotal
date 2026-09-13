// Contacts API: owns every /api/contacts* endpoint and the types they exchange.
import { api, toQueryString } from '../../lib/api';
import type {
  AccountLink,
  Contact,
  ContactExportPayload,
  PaginatedResult,
} from '../../types/domain';

export interface ContactListParams {
  q?: string;
  status?: string;
  owner?: string;
  /** First-letter filter on the last name (single A-Z character). */
  letter?: string;
  /** 'name' | 'name_desc' | 'updated' | 'updated_desc' (default 'updated_desc'). */
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** Writable fields for creating/updating a contact. */
export interface ContactInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  company?: string;
  address?: string;
  notes?: string;
  status?: Contact['status'];
  accountLinks?: AccountLink[];
}

/** Update payload: `updatedAt` is the optimistic-lock conflict token. */
export interface ContactUpdateInput extends ContactInput {
  updatedAt?: string;
}

export async function listContacts(params: ContactListParams): Promise<PaginatedResult<Contact>> {
  return api.get<PaginatedResult<Contact>>(`/api/contacts${toQueryString(params)}`);
}

export async function getContact(id: string): Promise<Contact> {
  return api.get<Contact>(`/api/contacts/${id}`);
}

export async function createContact(input: ContactInput): Promise<Contact> {
  return api.post<Contact>('/api/contacts', input);
}

export async function updateContact(id: string, input: ContactUpdateInput): Promise<Contact> {
  return api.patch<Contact>(`/api/contacts/${id}`, input);
}

export async function deleteContact(id: string): Promise<void> {
  await api.del<{ ok: true }>(`/api/contacts/${id}`);
}

export async function exportContact(id: string): Promise<ContactExportPayload> {
  return api.get<ContactExportPayload>(`/api/contacts/${id}/export`);
}
