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

/** A saved column-to-field mapping template for the CSV import wizard. */
export interface ImportMappingTemplate {
  id: string;
  entity: ImportEntity;
  name: string;
  /** csvHeader -> canonical field key */
  mapping: Record<string, string>;
  /** Optional CSV header that contains the record owner's email. */
  ownerColumn?: string;
  createdAt: string;
  updatedAt: string;
}

/** Canonical field keys accepted by the import handlers for each entity. */
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
  /** 1-based row number from the original file (for error messages). */
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

/** Payload returned by the admin trash list endpoint. */
export interface TrashPayload {
  contacts: Contact[];
  accounts: Account[];
  opportunities: Opportunity[];
  tasks: Task[];
  interactions: Interaction[];
}

/** Grouped global-search totals returned alongside search results. */
export interface SearchCounts {
  contacts: number;
  accounts: number;
  opportunities: number;
  tasks: number;
  interactions: number;
}

// ---------------------------------------------------------------------------
// Server / view-model payloads shared between API services and UI components.
// Each interface documents the endpoint that returns it.
// ---------------------------------------------------------------------------

export type AppEnvironment = 'production' | 'staging' | 'development';

/** Static deployment-level facts about the instance (GET /api/health). */
export interface InstanceInfo {
  orgName: string;
  version: string;
  environment: AppEnvironment;
  hostname: string;
  allowPasswordReset: boolean;
  setupRequired: boolean;
}

/** Task badge counts for the top bar (GET /api/tasks/summary). */
export interface TaskSummary {
  dueToday: number;
  overdue: number;
}

/** Account detail view (GET /api/accounts/:id). */
export interface AccountDetailPayload {
  account: Account;
  /** Account contacts, each carrying its link metadata for this account. */
  contacts: (Contact & { link?: AccountLink })[];
  opportunities: Opportunity[];
}

/** Contact export bundle (GET /api/contacts/:id/export). */
export interface ContactExportPayload {
  contact: Contact;
  interactions: Interaction[];
  opportunities: Opportunity[];
  tasks: Task[];
}

/** Opportunity detail view incl. stage history (GET /api/opportunities/:id). */
export interface OpportunityDetail extends Opportunity {
  history: StageHistoryEntry[];
}

/** Generic non-paginated list envelope used by list endpoints. */
export interface ListResult<T> {
  items: T[];
  total: number;
}

/** Paginated list envelope used by contacts/accounts/interactions endpoints. */
export interface PaginatedResult<T> extends ListResult<T> {
  page: number;
  pageSize: number;
}

/** Global search results with per-entity totals (GET /api/search). */
export interface GlobalSearchResults {
  contacts: Contact[];
  accounts: Account[];
  opportunities: Opportunity[];
  tasks: Task[];
  interactions: Interaction[];
  counts: SearchCounts;
}

/** One stage row of the pipeline report (GET /api/reports/pipeline). */
export interface PipelineReportRow {
  stageId: string;
  stageName: string;
  count: number;
  totalValue: number;
  weightedValue: number;
}

export interface PipelineReportPayload {
  rows: PipelineReportRow[];
}

export interface LossReasonBreakdown {
  reason: string;
  count: number;
}

/** Win/loss report summary (GET /api/reports/winloss). */
export interface WinLossReportPayload {
  wonCount: number;
  lostCount: number;
  wonValue: number;
  lostValue: number;
  winRate: number;
  lossReasons: LossReasonBreakdown[];
}
