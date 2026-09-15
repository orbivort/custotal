// CSV import (FR-IN-01): saved mapping templates, dry-run validation preview, and
// commit with duplicate skip/overwrite. The browser parses CSV and posts normalized
// records; the server validates, dedupes, and persists.
import { prisma } from '../db.ts';
import { errors } from '../lib/errors.ts';
import {
  isValidEmail,
  optionalString,
  CONTACT_IMPORT_FIELDS,
  ACCOUNT_IMPORT_FIELDS,
} from '../lib/validation.ts';
import { toImportTemplate } from '../serializers.ts';
import type {
  DuplicatePolicy,
  ImportDryRunResult,
  ImportDryRunRow,
  ImportEntity,
  ImportMappingTemplate,
  User,
} from '../types/domain.ts';

const CONTACT_KEYS = CONTACT_IMPORT_FIELDS as readonly string[];
const ACCOUNT_KEYS = ACCOUNT_IMPORT_FIELDS as readonly string[];

function emailKey(value: string | undefined): string | undefined {
  const v = optionalString(value)?.toLowerCase();
  return v || undefined;
}

function cell(record: Record<string, string>, key: string): string {
  return optionalString(record[key]) ?? '';
}

function validateContactRow(data: Record<string, string>): string[] {
  const reasons: string[] = [];
  if (!cell(data, 'firstName')) reasons.push('First name is required.');
  if (!cell(data, 'lastName')) reasons.push('Last name is required.');
  const email = cell(data, 'email');
  const phone = cell(data, 'phone');
  if (email && !isValidEmail(email)) reasons.push('Invalid email format.');
  if (!email && !phone) reasons.push('At least one of email or phone is required.');
  const status = cell(data, 'status');
  if (status && status !== 'active' && status !== 'inactive') {
    reasons.push('Status must be "active" or "inactive".');
  }
  return reasons;
}

function validateAccountRow(data: Record<string, string>): string[] {
  const reasons: string[] = [];
  if (!cell(data, 'name')) reasons.push('Account name is required.');
  return reasons;
}

function normalizeRows(entity: ImportEntity, records: Record<string, string>[]): ImportDryRunRow[] {
  const allowed = entity === 'contact' ? CONTACT_KEYS : ACCOUNT_KEYS;
  return records.map((raw, index) => {
    const data: Record<string, string> = {};
    for (const key of allowed) {
      const value = optionalString(raw[key]);
      if (value) data[key] = value;
    }
    const reasons = entity === 'contact' ? validateContactRow(data) : validateAccountRow(data);
    return { index: index + 1, valid: reasons.length === 0, reasons, data };
  });
}

async function existingContactsByEmail(): Promise<Map<string, string>> {
  const rows = await prisma.contact.findMany({
    where: { deletedAt: null, email: { not: null } },
    select: { id: true, email: true },
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    const key = emailKey(r.email ?? undefined);
    if (key) map.set(key, r.id);
  }
  return map;
}

function markDuplicates(rows: ImportDryRunRow[], existing: Set<string>): void {
  const seen = new Set(existing);
  for (const row of rows) {
    const email = emailKey(row.data.email);
    if (!email) continue;
    if (seen.has(email)) row.duplicate = true;
    else seen.add(email);
  }
}

async function resolveOwner(ownerEmail: string | undefined, fallbackId: string): Promise<string> {
  const raw = optionalString(ownerEmail);
  if (!raw) return fallbackId;
  const user = await prisma.user.findUnique({ where: { email: raw.toLowerCase() } });
  return user?.id ?? fallbackId;
}

// ---- Mapping templates ----------------------------------------------------

export async function listTemplates(entity?: string): Promise<ImportMappingTemplate[]> {
  const rows = await prisma.importMappingTemplate.findMany({
    where: entity ? { entity } : {},
    orderBy: { name: 'asc' },
  });
  return rows.map(toImportTemplate);
}

export async function saveTemplate(input: {
  entity?: unknown;
  name?: unknown;
  mapping?: unknown;
  ownerColumn?: unknown;
}): Promise<ImportMappingTemplate> {
  const entity = (input.entity as ImportEntity) ?? 'contact';
  if (entity !== 'contact' && entity !== 'account') {
    throw errors.validation([{ field: 'entity', message: 'Unknown import entity.' }]);
  }
  const name = optionalString(input.name);
  if (!name) {
    throw errors.validation([{ field: 'name', message: 'Template name is required.' }]);
  }
  const mapping = (input.mapping ?? {}) as Record<string, string>;
  if (Object.keys(mapping).length === 0) {
    throw errors.validation([
      { field: 'mapping', message: 'Map at least one column before saving.' },
    ]);
  }
  const ownerColumn = optionalString(input.ownerColumn);
  const existing = await prisma.importMappingTemplate.findUnique({
    where: { entity_name: { entity, name } },
  });
  if (existing) {
    const row = await prisma.importMappingTemplate.update({
      where: { id: existing.id },
      data: { mapping: mapping, ownerColumn: ownerColumn ?? null, updatedAt: new Date() },
    });
    return toImportTemplate(row);
  }
  const row = await prisma.importMappingTemplate.create({
    data: { entity, name, mapping, ownerColumn: ownerColumn ?? null },
  });
  return toImportTemplate(row);
}

export async function deleteTemplate(id: string): Promise<void> {
  const existing = await prisma.importMappingTemplate.findUnique({ where: { id } });
  if (!existing) throw errors.notFound('not_found', 'Template not found.');
  await prisma.importMappingTemplate.delete({ where: { id } });
}

// ---- Dry run --------------------------------------------------------------

export async function dryRun(
  entity: ImportEntity,
  records: Record<string, string>[],
): Promise<ImportDryRunResult> {
  const rows = normalizeRows(entity, records);
  if (entity === 'contact') {
    const existing = await existingContactsByEmail();
    markDuplicates(rows, new Set(existing.keys()));
  }
  const validCount = rows.filter((r) => r.valid && !r.duplicate).length;
  const errorCount = rows.length - validCount;
  return { entity, rows, validCount, errorCount };
}

// ---- Commit ---------------------------------------------------------------

export async function commitImport(
  entity: ImportEntity,
  records: Record<string, string>[],
  duplicate: DuplicatePolicy,
  admin: User,
): Promise<{
  entity: ImportEntity;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  const rows = normalizeRows(entity, records);
  const skip = duplicate !== 'overwrite';
  const summary = { entity, created: 0, updated: 0, skipped: 0, failed: 0 };

  if (entity === 'contact') {
    const byEmail = await existingContactsByEmail();
    const seen = new Set(byEmail.keys());
    const createdInRun = new Map<string, string>();

    for (const row of rows) {
      if (!row.valid) {
        summary.failed += 1;
        continue;
      }
      const email = emailKey(row.data.email);
      const existingId = email ? byEmail.get(email) : undefined;
      const createdId = email ? createdInRun.get(email) : undefined;
      const targetId = existingId ?? createdId;

      if (targetId && !skip) {
        await updateContactFields(targetId, row.data, admin.id);
        summary.updated += 1;
        continue;
      }
      if (skip && targetId) {
        summary.skipped += 1;
        continue;
      }

      const now = new Date();
      const created = await prisma.contact.create({
        data: {
          firstName: row.data.firstName ?? '',
          lastName: row.data.lastName ?? '',
          email: email ?? null,
          phone: row.data.phone || null,
          jobTitle: row.data.jobTitle || null,
          company: row.data.company || null,
          address: row.data.address || null,
          notes: row.data.notes || null,
          status: row.data.status === 'inactive' ? 'inactive' : 'active',
          createdBy: admin.id,
          updatedBy: admin.id,
          createdAt: now,
          updatedAt: now,
        },
      });
      if (email) {
        seen.add(email);
        createdInRun.set(email, created.id);
      }
      summary.created += 1;
    }
  } else {
    for (const row of rows) {
      if (!row.valid) {
        summary.failed += 1;
        continue;
      }
      const ownerId = await resolveOwner(row.data.ownerEmail, admin.id);
      await prisma.account.create({
        data: {
          name: row.data.name ?? '',
          industry: row.data.industry || null,
          website: row.data.website || null,
          phone: row.data.phone || null,
          billingAddress: row.data.billingAddress || null,
          notes: row.data.notes || null,
          ownerId,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      });
      summary.created += 1;
    }
  }
  return summary;
}

async function updateContactFields(
  id: string,
  data: Record<string, string>,
  adminId: string,
): Promise<void> {
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.contact.update({
    where: { id },
    data: {
      firstName: data.firstName || existing.firstName,
      lastName: data.lastName || existing.lastName,
      phone: data.phone || existing.phone,
      jobTitle: data.jobTitle || existing.jobTitle,
      company: data.company || existing.company,
      address: data.address || existing.address,
      notes: data.notes || existing.notes,
      status:
        data.status === 'active' || data.status === 'inactive' ? data.status : existing.status,
      updatedAt: new Date(),
      updatedBy: adminId,
    },
  });
}
