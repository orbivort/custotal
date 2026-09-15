// Admin-only operations: user management, pipeline stage configuration, and the
// 30-day trash / recovery workflow. Guards mirror the frontend mock.
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.ts';
import { env } from '../config.ts';
import { logger } from '../logger.ts';
import { errors, type FieldError } from '../lib/errors.ts';
import { ALL_ROLES } from '../lib/rbac.ts';
import { isValidEmail, optionalString, STAGE_CLASSIFICATIONS } from '../lib/validation.ts';
import { hashToken, generateToken } from '../lib/tokens.ts';
import { authLinkUrl, hashPassword } from './auth-service.ts';
import { SOFT_DELETE_RETENTION_DAYS } from './purge-service.ts';
import { sendInvitation } from './mailer.ts';
import {
  toStage,
  toUser,
  toContact,
  toAccount,
  toOpportunity,
  toTask,
  toInteraction,
} from '../serializers.ts';
import type { Role, Stage, StageClassification, User } from '../types/domain.ts';

// ---- Users ---------------------------------------------------------------

export async function listUsers(): Promise<User[]> {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  return users.map(toUser);
}

async function generateTempPassword(): Promise<string> {
  return randomBytes(9).toString('base64url'); // 12 chars, high entropy
}

export interface CreateUserResult {
  user: User;
  /** True when the invitation email was delivered. */
  inviteSent: boolean;
  /**
   * One-time temporary credential — present ONLY when the invitation email
   * could not be delivered (SMTP unconfigured or failed). The admin must share
   * it out-of-band; the user is forced to rotate it on first login.
   */
  tempPassword?: string;
}

export async function createUser(input: {
  name?: unknown;
  email?: unknown;
  role?: unknown;
}): Promise<CreateUserResult> {
  const details: FieldError[] = [];
  const name = optionalString(input.name) ?? '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const role = (input.role as Role | undefined) ?? 'rep';
  if (!name) details.push({ field: 'name', message: 'Full name is required.' });
  if (!isValidEmail(email)) details.push({ field: 'email', message: 'Invalid email format.' });
  else if (await prisma.user.findUnique({ where: { email } })) {
    details.push({ field: 'email', message: 'A user with this email already exists.' });
  }
  if (!ALL_ROLES.includes(role)) details.push({ field: 'role', message: 'Unknown role.' });
  if (details.length) throw errors.validation(details);

  // The temporary credential is the fallback path; the invitation email is the
  // primary one. Both exist from the start so user creation never fails on
  // email problems (blast-radius control).
  const tempPassword = await generateTempPassword();
  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      passwordHash: await hashPassword(tempPassword),
    },
  });

  const token = generateToken();
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      purpose: 'invite',
      userId: user.id,
      expiresAt: new Date(Date.now() + env.resetTokenTtlMinutes * 60_000),
    },
  });
  const inviteSent = await sendInvitation(email, name, authLinkUrl('invite', token));

  if (!inviteSent) {
    // Fallback: the admin gets the temp password once and must hand it over
    // out-of-band; the user is forced to rotate it on first login.
    const flagged = await prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });
    logger.warn(
      { action: 'admin.user.created', userId: user.id, inviteSent: false },
      // The temporary credential itself is only ever returned once, in the
      // HTTP response to the requesting admin — never written to logs.
      'Invitation email could not be delivered — a one-time temporary password was returned to the admin',
    );
    return { user: toUser(flagged), inviteSent: false, tempPassword };
  }

  logger.info(
    { action: 'admin.user.created', userId: user.id, inviteSent: true },
    'User created; invitation sent.',
  );
  return { user: toUser(user), inviteSent: true };
}

export async function updateUser(
  id: string,
  input: Partial<Pick<User, 'name' | 'email' | 'role'>>,
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw errors.notFound('not_found', 'User not found.');
  const details: FieldError[] = [];
  const next: { name?: string; email?: string; role?: string } = {};

  if (input.name !== undefined) {
    const name = optionalString(input.name) ?? '';
    if (!name) details.push({ field: 'name', message: 'Full name is required.' });
    else next.name = name;
  }
  if (input.email !== undefined) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) details.push({ field: 'email', message: 'Invalid email format.' });
    else if (await prisma.user.findFirst({ where: { email, id: { not: id } } })) {
      details.push({ field: 'email', message: 'A user with this email already exists.' });
    } else next.email = email;
  }
  if (input.role !== undefined) {
    const role = input.role;
    if (!ALL_ROLES.includes(role)) details.push({ field: 'role', message: 'Unknown role.' });
    else if (existing.role === 'admin' && role !== 'admin') {
      const admins = await prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1)
        details.push({ field: 'role', message: 'At least one administrator is required.' });
      else next.role = role;
    } else next.role = role;
  }
  if (details.length) throw errors.validation(details);

  const updated = await prisma.user.update({ where: { id }, data: next });
  return toUser(updated);
}

async function userOwnsRecords(userId: string): Promise<boolean> {
  const [accounts, opportunities, tasks] = await Promise.all([
    prisma.account.count({ where: { ownerId: userId } }),
    prisma.opportunity.count({ where: { ownerId: userId } }),
    prisma.task.count({ where: { assigneeId: userId } }),
  ]);
  return accounts > 0 || opportunities > 0 || tasks > 0;
}

export async function deleteUser(id: string, actor: User): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw errors.notFound('not_found', 'User not found.');
  if (existing.id === actor.id) {
    throw errors.badRequest('forbidden', 'You cannot delete your own account while signed in.');
  }
  if (existing.role === 'admin') {
    const admins = await prisma.user.count({ where: { role: 'admin' } });
    if (admins <= 1)
      throw errors.badRequest('forbidden', 'At least one administrator is required.');
  }
  if (await userOwnsRecords(existing.id)) {
    throw errors.inUse(
      'This user still owns accounts, deals, or tasks. Reassign their records before deleting them.',
    );
  }
  await prisma.user.delete({ where: { id } });
}

// ---- Pipeline stages ------------------------------------------------------

export async function createStage(input: {
  name?: unknown;
  winProbability?: unknown;
  classification?: unknown;
}): Promise<Stage> {
  const details: FieldError[] = [];
  const name = optionalString(input.name) ?? '';
  if (!name) details.push({ field: 'name', message: 'Stage name is required.' });
  else if (
    await prisma.stage.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
  ) {
    details.push({ field: 'name', message: 'A stage with this name already exists.' });
  }
  const probability =
    typeof input.winProbability === 'number' && Number.isFinite(input.winProbability)
      ? Math.round(input.winProbability)
      : 0;
  if (probability < 0 || probability > 100) {
    details.push({
      field: 'winProbability',
      message: 'Win probability must be between 0 and 100.',
    });
  }
  const classification = (input.classification as StageClassification | undefined) ?? 'open';
  if (!STAGE_CLASSIFICATIONS.includes(classification)) {
    details.push({ field: 'classification', message: 'Unknown stage classification.' });
  }
  if (details.length) throw errors.validation(details);

  const maxOrder = await prisma.stage.aggregate({ _max: { order: true } });
  const stage = await prisma.stage.create({
    data: {
      name,
      order: (maxOrder._max.order ?? -1) + 1,
      winProbability: probability,
      classification,
    },
  });
  return toStage(stage);
}

export async function updateStage(
  id: string,
  input: Partial<Pick<Stage, 'name' | 'winProbability' | 'classification'>>,
): Promise<Stage> {
  const existing = await prisma.stage.findUnique({ where: { id } });
  if (!existing) throw errors.notFound('not_found', 'Stage not found.');
  const details: FieldError[] = [];
  const next: { name?: string; winProbability?: number; classification?: string } = {};

  if (input.name !== undefined) {
    const name = optionalString(input.name) ?? '';
    if (!name) details.push({ field: 'name', message: 'Stage name is required.' });
    else if (
      await prisma.stage.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } },
      })
    ) {
      details.push({ field: 'name', message: 'A stage with this name already exists.' });
    } else next.name = name;
  }
  if (input.winProbability !== undefined) {
    const probability = Math.round(input.winProbability);
    if (probability < 0 || probability > 100) {
      details.push({
        field: 'winProbability',
        message: 'Win probability must be between 0 and 100.',
      });
    } else next.winProbability = probability;
  }
  if (input.classification !== undefined) {
    if (!STAGE_CLASSIFICATIONS.includes(input.classification)) {
      details.push({ field: 'classification', message: 'Unknown stage classification.' });
    } else next.classification = input.classification;
  }
  if (details.length) throw errors.validation(details);

  const updated = await prisma.stage.update({ where: { id }, data: next });
  return toStage(updated);
}

export async function deleteStage(id: string): Promise<void> {
  const existing = await prisma.stage.findUnique({ where: { id } });
  if (!existing) throw errors.notFound('not_found', 'Stage not found.');
  const occupied = await prisma.opportunity.count({ where: { stageId: id, deletedAt: null } });
  if (occupied > 0) {
    throw errors.inUse(
      `Stage "${existing.name}" still contains ${occupied} deal${occupied === 1 ? '' : 's'}. Move or close them before deleting.`,
    );
  }
  await prisma.stage.delete({ where: { id } });
}

export async function reorderStages(orderedIds: string[]): Promise<Stage[]> {
  const existing = await prisma.stage.findMany({ select: { id: true } });
  const current = existing
    .map((s) => s.id)
    .sort()
    .join('|');
  const next = [...orderedIds].sort().join('|');
  if (current !== next) {
    throw errors.badRequest('validation', 'Stage list does not match the current pipeline.');
  }
  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.stage.update({ where: { id }, data: { order: index } })),
  );
  const stages = await prisma.stage.findMany({ orderBy: { order: 'asc' } });
  return stages.map(toStage);
}

// ---- Trash / recovery -----------------------------------------------------

function trashWindow(): Date {
  return new Date(Date.now() - SOFT_DELETE_RETENTION_DAYS * 86400000);
}

export async function listTrash() {
  const cutoff = trashWindow();
  const [contacts, accounts, opportunities, tasks, interactions] = await Promise.all([
    prisma.contact.findMany({
      where: { deletedAt: { gte: cutoff } },
      orderBy: { deletedAt: 'desc' },
      include: { accountLinks: true },
    }),
    prisma.account.findMany({
      where: { deletedAt: { gte: cutoff } },
      orderBy: { deletedAt: 'desc' },
    }),
    prisma.opportunity.findMany({
      where: { deletedAt: { gte: cutoff } },
      orderBy: { deletedAt: 'desc' },
    }),
    prisma.task.findMany({ where: { deletedAt: { gte: cutoff } }, orderBy: { deletedAt: 'desc' } }),
    prisma.interaction.findMany({
      where: { deletedAt: { gte: cutoff } },
      orderBy: { deletedAt: 'desc' },
    }),
  ]);
  return {
    contacts: contacts.map(toContact),
    accounts: accounts.map(toAccount),
    opportunities: opportunities.map(toOpportunity),
    tasks: tasks.map(toTask),
    interactions: interactions.map(toInteraction),
  };
}

export async function restoreTrashContact(id: string, actor: User) {
  const contact = await prisma.contact.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!contact) throw errors.notFound('not_found', 'Deleted contact not found.');
  const updated = await prisma.contact.update({
    where: { id },
    data: { deletedAt: null, updatedAt: new Date(), updatedBy: actor.id },
    include: { accountLinks: true },
  });
  return toContact(updated);
}

export async function restoreTrashAccount(id: string, actor: User) {
  const account = await prisma.account.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!account) throw errors.notFound('not_found', 'Deleted account not found.');
  const updated = await prisma.account.update({
    where: { id },
    data: { deletedAt: null, updatedAt: new Date(), updatedBy: actor.id },
  });
  return toAccount(updated);
}

export async function purgeTrashContact(id: string): Promise<void> {
  const contact = await prisma.contact.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!contact) throw errors.notFound('not_found', 'Deleted contact not found.');
  const [interactions, opportunities, tasks] = await Promise.all([
    prisma.interaction.count({ where: { contactId: id } }),
    prisma.opportunity.count({ where: { contactId: id } }),
    prisma.task.count({ where: { contactId: id } }),
  ]);
  if (interactions || opportunities || tasks) {
    throw errors.inUse(
      'This contact still has linked interactions, deals, or tasks. Permanently delete or reassign those records first.',
    );
  }
  await prisma.contact.delete({ where: { id } });
}

export async function purgeTrashAccount(id: string): Promise<void> {
  const account = await prisma.account.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!account) throw errors.notFound('not_found', 'Deleted account not found.');
  const [links, opportunities, tasks, interactions] = await Promise.all([
    prisma.contactAccountLink.count({ where: { accountId: id } }),
    prisma.opportunity.count({ where: { accountId: id } }),
    prisma.task.count({ where: { accountId: id } }),
    prisma.interaction.count({ where: { accountId: id } }),
  ]);
  if (links || opportunities || tasks || interactions) {
    throw errors.inUse(
      'This account still has linked contacts, deals, interactions, or tasks. Permanently delete or reassign those records first.',
    );
  }
  await prisma.account.delete({ where: { id } });
}

// ---- Trash / recovery: opportunities, tasks, interactions (FR-CC-05) -------

async function getDeletedOpportunity(id: string) {
  const row = await prisma.opportunity.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!row) throw errors.notFound('not_found', 'Deleted opportunity not found.');
  return row;
}

async function getDeletedTask(id: string) {
  const row = await prisma.task.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!row) throw errors.notFound('not_found', 'Deleted task not found.');
  return row;
}

async function getDeletedInteraction(id: string) {
  const row = await prisma.interaction.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!row) throw errors.notFound('not_found', 'Deleted interaction not found.');
  return row;
}

export async function restoreTrashOpportunity(id: string, actor: User) {
  await getDeletedOpportunity(id);
  const updated = await prisma.opportunity.update({
    where: { id },
    data: { deletedAt: null, updatedAt: new Date(), updatedBy: actor.id },
  });
  return toOpportunity(updated);
}

export async function restoreTrashTask(id: string, actor: User) {
  await getDeletedTask(id);
  const updated = await prisma.task.update({
    where: { id },
    data: { deletedAt: null, updatedAt: new Date(), updatedBy: actor.id },
  });
  return toTask(updated);
}

export async function restoreTrashInteraction(id: string, actor: User) {
  await getDeletedInteraction(id);
  const updated = await prisma.interaction.update({
    where: { id },
    data: { deletedAt: null, updatedAt: new Date(), updatedBy: actor.id },
  });
  return toInteraction(updated);
}

export async function purgeTrashOpportunity(id: string): Promise<void> {
  await getDeletedOpportunity(id);
  const [interactions, tasks] = await Promise.all([
    prisma.interaction.count({ where: { opportunityId: id } }),
    prisma.task.count({ where: { opportunityId: id } }),
  ]);
  if (interactions || tasks) {
    throw errors.inUse(
      'This deal still has linked interactions or tasks. Permanently delete or reassign those records first.',
    );
  }
  await prisma.opportunity.delete({ where: { id } });
}

export async function purgeTrashTask(id: string): Promise<void> {
  await getDeletedTask(id);
  const interactions = await prisma.interaction.count({ where: { taskId: id } });
  if (interactions) {
    throw errors.inUse(
      'This task still has linked interactions. Permanently delete or reassign those records first.',
    );
  }
  await prisma.task.delete({ where: { id } });
}

export async function purgeTrashInteraction(id: string): Promise<void> {
  await getDeletedInteraction(id);
  await prisma.interaction.delete({ where: { id } });
}
