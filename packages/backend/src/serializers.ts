// Mappers from Prisma rows to the wire types the frontend expects.
// Handles null -> undefined coercion and UTC/date-only formatting.
import type {
  Account,
  AccountLink,
  Contact,
  ImportEntity,
  ImportMappingTemplate,
  Interaction,
  Opportunity,
  Role,
  Stage,
  StageClassification,
  StageHistoryEntry,
  Task,
  User,
} from './types/domain.ts';
import { dateOnlyString, iso } from './lib/time.ts';

// Narrow input shapes (Prisma rows structurally satisfy these).
interface ScalarContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  company: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
}
export interface ContactRow extends ScalarContact {
  accountLinks: { accountId: string; primary: boolean; role: string }[];
}

interface ScalarAccount {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  billingAddress: string | null;
  ownerId: string;
  notes: string | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
}
export type AccountRow = ScalarAccount;

interface ScalarInteraction {
  id: string;
  type: string;
  dateTime: Date;
  channel: string | null;
  direction: string | null;
  summary: string;
  contactId: string;
  accountId: string | null;
  opportunityId: string | null;
  taskId: string | null;
  responsibleUserId: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
}
export type InteractionRow = ScalarInteraction;

interface ScalarOpportunity {
  id: string;
  name: string;
  contactId: string | null;
  accountId: string;
  valueMinor: number;
  currency: string;
  expectedCloseDate: Date;
  stageId: string;
  probability: number;
  probabilityManual: boolean;
  ownerId: string;
  description: string | null;
  lossReason: string | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
}
export type OpportunityRow = ScalarOpportunity;

interface ScalarTask {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  priority: string;
  status: string;
  assigneeId: string;
  contactId: string | null;
  accountId: string | null;
  opportunityId: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
}
export type TaskRow = ScalarTask;

export function toUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword?: boolean;
}): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    mustChangePassword: u.mustChangePassword ?? false,
  };
}

export function toStage(s: {
  id: string;
  name: string;
  order: number;
  winProbability: number;
  classification: string;
}): Stage {
  return {
    id: s.id,
    name: s.name,
    order: s.order,
    winProbability: s.winProbability,
    classification: s.classification as StageClassification,
  };
}

export function toAccount(a: ScalarAccount): Account {
  return {
    id: a.id,
    name: a.name,
    industry: a.industry ?? undefined,
    website: a.website ?? undefined,
    phone: a.phone ?? undefined,
    billingAddress: a.billingAddress ?? undefined,
    ownerId: a.ownerId,
    notes: a.notes ?? undefined,
    createdAt: iso(a.createdAt)!,
    createdBy: a.createdBy,
    updatedAt: iso(a.updatedAt)!,
    updatedBy: a.updatedBy,
    deletedAt: iso(a.deletedAt),
  };
}

export function toAccountLink(l: {
  accountId: string;
  primary: boolean;
  role: string;
}): AccountLink {
  return { accountId: l.accountId, primary: l.primary, role: l.role };
}

export function toContact(c: ContactRow): Contact {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
    jobTitle: c.jobTitle ?? undefined,
    company: c.company ?? undefined,
    address: c.address ?? undefined,
    notes: c.notes ?? undefined,
    status: c.status === 'inactive' ? 'inactive' : 'active',
    accountLinks: c.accountLinks.map(toAccountLink),
    createdAt: iso(c.createdAt)!,
    createdBy: c.createdBy,
    updatedAt: iso(c.updatedAt)!,
    updatedBy: c.updatedBy,
    deletedAt: iso(c.deletedAt),
  };
}

export function toInteraction(i: ScalarInteraction): Interaction {
  return {
    id: i.id,
    type: i.type as Interaction['type'],
    dateTime: iso(i.dateTime)!,
    channel: i.channel ?? undefined,
    direction: (i.direction ?? undefined) as Interaction['direction'],
    summary: i.summary,
    contactId: i.contactId,
    accountId: i.accountId ?? undefined,
    opportunityId: i.opportunityId ?? undefined,
    taskId: i.taskId ?? undefined,
    responsibleUserId: i.responsibleUserId,
    createdAt: iso(i.createdAt)!,
    createdBy: i.createdBy,
    updatedAt: iso(i.updatedAt)!,
    updatedBy: i.updatedBy,
    deletedAt: iso(i.deletedAt),
  };
}

export function toOpportunity(o: ScalarOpportunity): Opportunity {
  return {
    id: o.id,
    name: o.name,
    contactId: o.contactId ?? undefined,
    accountId: o.accountId,
    valueMinor: o.valueMinor,
    currency: o.currency,
    expectedCloseDate: dateOnlyString(o.expectedCloseDate)!,
    stageId: o.stageId,
    probability: o.probability,
    probabilityManual: o.probabilityManual,
    ownerId: o.ownerId,
    description: o.description ?? undefined,
    lossReason: o.lossReason ?? undefined,
    createdAt: iso(o.createdAt)!,
    createdBy: o.createdBy,
    updatedAt: iso(o.updatedAt)!,
    updatedBy: o.updatedBy,
    deletedAt: iso(o.deletedAt),
  };
}

export function toStageHistory(h: {
  id: string;
  opportunityId: string;
  fromStageId: string | null;
  toStageId: string;
  userId: string;
  timestamp: Date;
}): StageHistoryEntry {
  return {
    id: h.id,
    opportunityId: h.opportunityId,
    fromStageId: h.fromStageId,
    toStageId: h.toStageId,
    userId: h.userId,
    timestamp: iso(h.timestamp)!,
  };
}

export function toTask(t: ScalarTask): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    dueDate: dateOnlyString(t.dueDate),
    priority: t.priority as Task['priority'],
    status: t.status === 'completed' ? 'completed' : 'open',
    assigneeId: t.assigneeId,
    contactId: t.contactId ?? undefined,
    accountId: t.accountId ?? undefined,
    opportunityId: t.opportunityId ?? undefined,
    completedAt: iso(t.completedAt),
    completedBy: t.completedBy ?? undefined,
    createdAt: iso(t.createdAt)!,
    createdBy: t.createdBy,
    updatedAt: iso(t.updatedAt)!,
    updatedBy: t.updatedBy,
    deletedAt: iso(t.deletedAt),
  };
}

export function toImportTemplate(t: {
  id: string;
  entity: string;
  name: string;
  mapping: unknown;
  ownerColumn: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ImportMappingTemplate {
  return {
    id: t.id,
    entity: t.entity as ImportEntity,
    name: t.name,
    mapping: (t.mapping ?? {}) as Record<string, string>,
    ownerColumn: t.ownerColumn ?? undefined,
    createdAt: iso(t.createdAt)!,
    updatedAt: iso(t.updatedAt)!,
  };
}
