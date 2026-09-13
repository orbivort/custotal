// Wire types mirroring the frontend contract (packages/frontend/src/types/domain.ts).
// These are the JSON shapes the API returns so the existing UI keeps working unchanged.

export type Role = 'admin' | 'manager' | 'rep' | 'readonly';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** True when the user holds a temporary credential that must be rotated. */
  mustChangePassword?: boolean;
}

export type StageClassification = 'open' | 'won' | 'lost';

export interface Stage {
  id: string;
  name: string;
  order: number;
  winProbability: number;
  classification: StageClassification;
}

export interface AccountLink {
  accountId: string;
  primary: boolean;
  role: string;
}

export interface Account {
  id: string;
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  billingAddress?: string;
  ownerId: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt?: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  company?: string;
  address?: string;
  notes?: string;
  status: 'active' | 'inactive';
  accountLinks: AccountLink[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt?: string;
}

export type InteractionType = 'email' | 'call' | 'meeting' | 'note' | 'other';
export type InteractionDirection = 'inbound' | 'outbound';

export interface Interaction {
  id: string;
  type: InteractionType;
  dateTime: string;
  channel?: string;
  direction?: InteractionDirection;
  summary: string;
  contactId: string;
  accountId?: string;
  opportunityId?: string;
  taskId?: string;
  responsibleUserId: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt?: string;
}

export interface Opportunity {
  id: string;
  name: string;
  contactId?: string;
  accountId: string;
  valueMinor: number;
  currency: string;
  expectedCloseDate: string;
  stageId: string;
  probability: number;
  probabilityManual: boolean;
  ownerId: string;
  description?: string;
  lossReason?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt?: string;
}

export interface StageHistoryEntry {
  id: string;
  opportunityId: string;
  fromStageId: string | null;
  toStageId: string;
  userId: string;
  timestamp: string;
}

export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'open' | 'completed';

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string;
  contactId?: string;
  accountId?: string;
  opportunityId?: string;
  completedAt?: string;
  completedBy?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}

export type ImportEntity = 'contact' | 'account';
export type DuplicatePolicy = 'skip' | 'overwrite';

export interface ImportMappingTemplate {
  id: string;
  entity: ImportEntity;
  name: string;
  mapping: Record<string, string>;
  ownerColumn?: string;
  createdAt: string;
  updatedAt: string;
}

export type ContactImportFields =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'jobTitle'
  | 'company'
  | 'address'
  | 'notes'
  | 'status'
  | 'ownerEmail';
export type AccountImportFields =
  'name' | 'industry' | 'website' | 'phone' | 'billingAddress' | 'notes' | 'ownerEmail';

export interface ImportDryRunRow {
  index: number;
  valid: boolean;
  reasons: string[];
  duplicate?: boolean;
  data: Record<string, string>;
}

export interface ImportDryRunResult {
  entity: ImportEntity;
  rows: ImportDryRunRow[];
  validCount: number;
  errorCount: number;
}

export interface ImportCommitSummary {
  entity: ImportEntity;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface TrashPayload {
  contacts: Contact[];
  accounts: Account[];
}

export interface SearchCounts {
  contacts: number;
  accounts: number;
  opportunities: number;
  tasks: number;
  interactions: number;
}

export interface SearchResults {
  contacts: Contact[];
  accounts: Account[];
  opportunities: Opportunity[];
  tasks: Task[];
  interactions: Interaction[];
  counts: SearchCounts;
}

export interface InstanceInfo {
  orgName: string;
  version: string;
  environment: 'production' | 'staging' | 'development';
  hostname: string;
  allowPasswordReset: boolean;
  setupRequired: boolean;
}
