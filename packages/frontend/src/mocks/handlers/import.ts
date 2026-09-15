import { http } from 'msw';
import type {
  Account,
  Contact,
  DuplicatePolicy,
  ImportCommitSummary,
  ImportDryRunResult,
  ImportDryRunRow,
  ImportEntity,
  ImportMappingTemplate,
} from '../../types/domain';
import { isValidEmail } from '../../lib/validation';
import { getDB, persist } from '../db/store';
import { adminGate, err, genId, json, nowISO } from './helpers';

export const CONTACT_IMPORT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'jobTitle',
  'company',
  'address',
  'notes',
  'status',
  'ownerEmail',
] as const;

export const ACCOUNT_IMPORT_FIELDS = [
  'name',
  'industry',
  'website',
  'phone',
  'billingAddress',
  'notes',
  'ownerEmail',
] as const;

interface DryRunBody {
  entity?: ImportEntity;
  records?: Record<string, string>[];
}

interface CommitBody extends DryRunBody {
  duplicate?: DuplicatePolicy;
}

interface TemplateBody {
  entity?: ImportEntity;
  name?: string;
  mapping?: Record<string, string>;
  ownerColumn?: string;
}

function cell(record: Record<string, string>, key: string): string {
  return (record[key] ?? '').trim();
}

function emailKey(value: string | undefined): string | undefined {
  const v = (value ?? '').trim().toLowerCase();
  return v || undefined;
}

function resolveOwner(ownerEmail: string | undefined, fallbackId: string): string {
  if (!ownerEmail) return fallbackId;
  const db = getDB();
  const match = db.users.find((u) => u.email.toLowerCase() === ownerEmail.trim().toLowerCase());
  return match?.id ?? fallbackId;
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

/** Detect email matches against existing non-deleted contacts AND earlier rows in this file. */
function markDuplicates(
  entity: ImportEntity,
  rows: ImportDryRunRow[],
  existingEmails: Set<string>,
): void {
  if (entity !== 'contact') return;
  const seen = new Set(existingEmails);
  rows.forEach((row) => {
    const email = emailKey(row.data.email);
    if (!email) return;
    if (seen.has(email)) row.duplicate = true;
    else seen.add(email);
  });
}

function normalizeRecords(
  entity: ImportEntity,
  records: Record<string, string>[],
): ImportDryRunRow[] {
  const allowed = entity === 'contact' ? CONTACT_IMPORT_FIELDS : ACCOUNT_IMPORT_FIELDS;
  return records.map((raw, index) => {
    const data: Record<string, string> = {};
    for (const key of allowed) {
      const value = raw[key]?.trim();
      if (value) data[key] = value;
    }
    const reasons = entity === 'contact' ? validateContactRow(data) : validateAccountRow(data);
    return { index: index + 1, valid: reasons.length === 0, reasons, data };
  });
}

export const importHandlers = [
  // ---- Mapping templates ------------------------------------------------
  http.get('/api/import/templates', ({ request }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const entity = new URL(request.url).searchParams.get('entity');
    const db = getDB();
    const items = entity
      ? db.importMappings.filter((t) => t.entity === entity)
      : [...db.importMappings];
    return json({ items: items.sort((a, b) => a.name.localeCompare(b.name)) });
  }),

  http.post('/api/import/templates', async ({ request }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as TemplateBody;
    const entity = body.entity ?? 'contact';
    if (entity !== 'contact' && entity !== 'account') {
      return err(400, 'validation', 'Unknown import entity.');
    }
    const name = body.name?.trim() ?? '';
    if (!name) {
      return err(400, 'validation', 'Template name is required.', [
        { field: 'name', message: 'Template name is required.' },
      ]);
    }
    const mapping = body.mapping ?? {};
    if (Object.keys(mapping).length === 0) {
      return err(400, 'validation', 'Map at least one column before saving.', [
        { field: 'mapping', message: 'Map at least one column before saving.' },
      ]);
    }
    const db = getDB();
    const existing = db.importMappings.find((t) => t.entity === entity && t.name === name);
    const now = nowISO();
    let template: ImportMappingTemplate;
    if (existing) {
      existing.mapping = mapping;
      existing.ownerColumn = body.ownerColumn;
      existing.updatedAt = now;
      template = existing;
    } else {
      template = {
        id: genId('tpl'),
        entity,
        name,
        mapping,
        ownerColumn: body.ownerColumn,
        createdAt: now,
        updatedAt: now,
      };
      db.importMappings.push(template);
    }
    persist();
    return json(template, existing ? 200 : 201);
  }),

  http.delete('/api/import/templates/:id', ({ params }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    const index = db.importMappings.findIndex((t) => t.id === params.id);
    if (index < 0) return err(404, 'not_found', 'Template not found.');
    db.importMappings.splice(index, 1);
    persist();
    return json({ ok: true });
  }),

  // ---- Dry run -----------------------------------------------------------
  http.post('/api/import/dry-run', async ({ request }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as DryRunBody;
    const entity: ImportEntity = body.entity === 'account' ? 'account' : 'contact';
    const records = Array.isArray(body.records) ? body.records : [];

    const rows = normalizeRecords(entity, records);
    const db = getDB();
    if (entity === 'contact') {
      const existing = new Set(
        db.contacts.filter((c) => !c.deletedAt && c.email).map((c) => emailKey(c.email) as string),
      );
      markDuplicates(entity, rows, existing);
    }
    const validCount = rows.filter((r) => r.valid && !r.duplicate).length;
    const errorCount = rows.filter((r) => !r.valid || r.duplicate).length;
    const result: ImportDryRunResult = { entity, rows, validCount, errorCount };
    return json(result);
  }),

  // ---- Commit -------------------------------------------------------------
  http.post('/api/import/commit', async ({ request }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as CommitBody;
    const entity: ImportEntity = body.entity === 'account' ? 'account' : 'contact';
    const records = Array.isArray(body.records) ? body.records : [];
    const duplicate: DuplicatePolicy = body.duplicate === 'overwrite' ? 'overwrite' : 'skip';
    const db = getDB();
    const fallbackOwner = admin.id;

    const summary: ImportCommitSummary = { entity, created: 0, updated: 0, skipped: 0, failed: 0 };
    const rows = normalizeRecords(entity, records);
    if (entity === 'contact') {
      const existing = new Map<string, Contact>();
      db.contacts
        .filter((c) => !c.deletedAt && c.email)
        .forEach((c) => existing.set(emailKey(c.email) as string, c));
      const seen = new Set(existing.keys());
      const createdInRun = new Map<string, Contact>();
      rows.forEach((row) => {
        if (!row.valid) {
          summary.failed += 1;
          return;
        }
        const email = emailKey(row.data.email);
        const existingContact = email ? existing.get(email) : undefined;
        const inRun = email ? createdInRun.get(email) : undefined;
        const base = existingContact ?? inRun;
        const now = nowISO();

        if (duplicate === 'overwrite' && base) {
          Object.assign(base, {
            firstName: row.data.firstName || base.firstName,
            lastName: row.data.lastName || base.lastName,
            email: base.email,
            phone: row.data.phone || base.phone,
            jobTitle: row.data.jobTitle || base.jobTitle,
            company: row.data.company || base.company,
            address: row.data.address || base.address,
            notes: row.data.notes || base.notes,
            status:
              row.data.status === 'active' || row.data.status === 'inactive'
                ? row.data.status
                : base.status,
            updatedAt: now,
            updatedBy: admin.id,
          });
          summary.updated += 1;
          return;
        }

        if (duplicate === 'skip' && email && seen.has(email)) {
          summary.skipped += 1;
          return;
        }

        const contact: Contact = {
          id: genId('c'),
          firstName: row.data.firstName ?? '',
          lastName: row.data.lastName ?? '',
          email: email || undefined,
          phone: row.data.phone || undefined,
          jobTitle: row.data.jobTitle || undefined,
          company: row.data.company || undefined,
          address: row.data.address || undefined,
          notes: row.data.notes || undefined,
          status: row.data.status === 'inactive' ? 'inactive' : 'active',
          accountLinks: [],
          createdAt: now,
          createdBy: admin.id,
          updatedAt: now,
          updatedBy: admin.id,
        };
        db.contacts.push(contact);
        if (email) {
          seen.add(email);
          createdInRun.set(email, contact);
        }
        summary.created += 1;
      });
    } else {
      rows.forEach((row) => {
        if (!row.valid) {
          summary.failed += 1;
          return;
        }
        const ownerId = resolveOwner(row.data.ownerEmail, fallbackOwner);
        const now = nowISO();
        const account: Account = {
          id: genId('a'),
          name: row.data.name ?? '',
          industry: row.data.industry || undefined,
          website: row.data.website || undefined,
          phone: row.data.phone || undefined,
          billingAddress: row.data.billingAddress || undefined,
          notes: row.data.notes || undefined,
          ownerId,
          createdAt: now,
          createdBy: admin.id,
          updatedAt: now,
          updatedBy: admin.id,
        };
        db.accounts.push(account);
        summary.created += 1;
      });
    }
    persist();
    return json(summary);
  }),
];
