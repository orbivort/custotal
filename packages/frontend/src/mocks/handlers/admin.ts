import { http } from 'msw';
import type { Role, Stage, StageClassification, User } from '../../types/domain';
import { ALL_ROLES } from '../../lib/rbac';
import { isValidEmail } from '../../lib/validation';
import { getDB, persist } from '../db/store';
import { adminGate, err, genId, json, nowISO } from './helpers';

function stageInUse(db: ReturnType<typeof getDB>, stageId: string): number {
  return db.opportunities.filter((o) => o.stageId === stageId).length;
}

function userOwnsRecords(db: ReturnType<typeof getDB>, userId: string): boolean {
  return (
    db.accounts.some((a) => a.ownerId === userId) ||
    db.opportunities.some((o) => o.ownerId === userId) ||
    db.tasks.some((t) => t.assigneeId === userId)
  );
}

function reindexStages(db: ReturnType<typeof getDB>): void {
  [...db.stages]
    .sort((a, b) => a.order - b.order)
    .forEach((s, index) => {
      s.order = index;
    });
}

export const adminHandlers = [
  // ---- Users -----------------------------------------------------------
  http.get('/api/admin/users', () => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    return json({ items: [...db.users].sort((a, b) => a.name.localeCompare(b.name)) });
  }),

  http.post('/api/admin/users', async ({ request }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as { name?: string; email?: string; role?: Role };
    const db = getDB();

    const details: { field: string; message: string }[] = [];
    const name = body.name?.trim() ?? '';
    const email = (body.email ?? '').trim().toLowerCase();
    const role = body.role ?? 'rep';
    if (!name) details.push({ field: 'name', message: 'Full name is required.' });
    if (!isValidEmail(email)) details.push({ field: 'email', message: 'Invalid email format.' });
    else if (db.users.some((u) => u.email.toLowerCase() === email)) {
      details.push({ field: 'email', message: 'A user with this email already exists.' });
    }
    if (!ALL_ROLES.includes(role)) details.push({ field: 'role', message: 'Unknown role.' });
    if (details.length)
      return err(400, 'validation', 'Please correct the highlighted fields.', details);

    const user: User = { id: genId('u'), name, email, role };
    db.users.push(user);
    persist();
    // The real backend emails a set-password invitation; the mock always
    // reports a successful send (no SMTP concept in the browser mock).
    return json({ user, inviteSent: true }, 201);
  }),

  http.patch('/api/admin/users/:id', async ({ request, params }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    const index = db.users.findIndex((u) => u.id === params.id);
    if (index < 0) return err(404, 'not_found', 'User not found.');
    const existing = db.users[index];
    const body = (await request.json()) as Partial<User>;

    const details: { field: string; message: string }[] = [];
    const next: User = { ...existing };

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) details.push({ field: 'name', message: 'Full name is required.' });
      else next.name = name;
    }
    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      if (!isValidEmail(email)) details.push({ field: 'email', message: 'Invalid email format.' });
      else if (db.users.some((u) => u.email.toLowerCase() === email && u.id !== existing.id)) {
        details.push({ field: 'email', message: 'A user with this email already exists.' });
      } else next.email = email;
    }
    if (body.role !== undefined) {
      if (!ALL_ROLES.includes(body.role)) {
        details.push({ field: 'role', message: 'Unknown role.' });
      } else if (
        existing.role === 'admin' &&
        body.role !== 'admin' &&
        db.users.filter((u) => u.role === 'admin').length <= 1
      ) {
        details.push({ field: 'role', message: 'At least one administrator is required.' });
      } else next.role = body.role;
    }
    if (details.length)
      return err(400, 'validation', 'Please correct the highlighted fields.', details);

    db.users[index] = next;
    persist();
    return json(next);
  }),

  http.delete('/api/admin/users/:id', ({ params }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    const index = db.users.findIndex((u) => u.id === params.id);
    if (index < 0) return err(404, 'not_found', 'User not found.');
    const target = db.users[index];
    if (target.id === admin.id) {
      return err(400, 'forbidden', 'You cannot delete your own account while signed in.');
    }
    if (target.role === 'admin' && db.users.filter((u) => u.role === 'admin').length <= 1) {
      return err(400, 'forbidden', 'At least one administrator is required.');
    }
    if (userOwnsRecords(db, target.id)) {
      return err(
        409,
        'in_use',
        'This user still owns accounts, deals, or tasks. Reassign their records before deleting them.',
      );
    }
    db.users.splice(index, 1);
    persist();
    return json({ ok: true });
  }),

  // ---- Pipeline stages -------------------------------------------------
  http.post('/api/admin/stages', async ({ request }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as {
      name?: string;
      winProbability?: number;
      classification?: StageClassification;
    };
    const db = getDB();

    const details: { field: string; message: string }[] = [];
    const name = body.name?.trim() ?? '';
    if (!name) details.push({ field: 'name', message: 'Stage name is required.' });
    else if (db.stages.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      details.push({ field: 'name', message: 'A stage with this name already exists.' });
    }
    const probability = Number.isFinite(body.winProbability)
      ? Math.round(body.winProbability ?? 0)
      : 0;
    if (probability < 0 || probability > 100) {
      details.push({
        field: 'winProbability',
        message: 'Win probability must be between 0 and 100.',
      });
    }
    const classification: StageClassification = body.classification ?? 'open';
    if (!['open', 'won', 'lost'].includes(classification)) {
      details.push({ field: 'classification', message: 'Unknown stage classification.' });
    }
    if (details.length)
      return err(400, 'validation', 'Please correct the highlighted fields.', details);

    const maxOrder = db.stages.reduce((max, s) => Math.max(max, s.order), -1);
    const stage: Stage = {
      id: genId('s'),
      name,
      order: maxOrder + 1,
      winProbability: probability,
      classification,
    };
    db.stages.push(stage);
    persist();
    return json(stage, 201);
  }),

  http.patch('/api/admin/stages/:id', async ({ request, params }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    const index = db.stages.findIndex((s) => s.id === params.id);
    if (index < 0) return err(404, 'not_found', 'Stage not found.');
    const existing = db.stages[index];
    const body = (await request.json()) as Partial<Stage>;

    const details: { field: string; message: string }[] = [];
    const next: Stage = { ...existing };

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) details.push({ field: 'name', message: 'Stage name is required.' });
      else if (
        db.stages.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== existing.id)
      ) {
        details.push({ field: 'name', message: 'A stage with this name already exists.' });
      } else next.name = name;
    }
    if (body.winProbability !== undefined) {
      const probability = Math.round(body.winProbability);
      if (probability < 0 || probability > 100) {
        details.push({
          field: 'winProbability',
          message: 'Win probability must be between 0 and 100.',
        });
      } else next.winProbability = probability;
    }
    if (body.classification !== undefined) {
      if (!['open', 'won', 'lost'].includes(body.classification)) {
        details.push({ field: 'classification', message: 'Unknown stage classification.' });
      } else next.classification = body.classification;
    }
    if (details.length)
      return err(400, 'validation', 'Please correct the highlighted fields.', details);

    db.stages[index] = next;
    persist();
    return json(next);
  }),

  http.delete('/api/admin/stages/:id', ({ params }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    const index = db.stages.findIndex((s) => s.id === params.id);
    if (index < 0) return err(404, 'not_found', 'Stage not found.');
    const stage = db.stages[index];
    const occupied = stageInUse(db, stage.id);
    if (occupied > 0) {
      return err(
        409,
        'in_use',
        `Stage "${stage.name}" still contains ${occupied} deal${occupied === 1 ? '' : 's'}. Move or close them before deleting.`,
      );
    }
    db.stages.splice(index, 1);
    reindexStages(db);
    persist();
    return json({ ok: true });
  }),

  http.post('/api/admin/stages/reorder', async ({ request }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as { orderedIds?: string[] };
    const orderedIds = body.orderedIds ?? [];
    const db = getDB();
    const currentIds = db.stages
      .map((s) => s.id)
      .sort()
      .join('|');
    const nextIds = [...orderedIds].sort().join('|');
    if (currentIds !== nextIds)
      return err(400, 'validation', 'Stage list does not match the current pipeline.');
    orderedIds.forEach((id, index) => {
      const stage = db.stages.find((s) => s.id === id);
      if (stage) stage.order = index;
    });
    persist();
    return json({ items: [...db.stages].sort((a, b) => a.order - b.order) });
  }),

  // ---- Trash / recovery ------------------------------------------------
  http.get('/api/admin/trash', () => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const contacts = db.contacts
      .filter((c) => c.deletedAt && c.deletedAt >= cutoff)
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
    const accounts = db.accounts
      .filter((a) => a.deletedAt && a.deletedAt >= cutoff)
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
    return json({ contacts, accounts });
  }),

  http.post('/api/admin/trash/contacts/:id/restore', ({ params }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === params.id);
    if (!contact || !contact.deletedAt) return err(404, 'not_found', 'Deleted contact not found.');
    contact.deletedAt = undefined;
    contact.updatedAt = nowISO();
    contact.updatedBy = admin.id;
    persist();
    return json(contact);
  }),

  http.post('/api/admin/trash/accounts/:id/restore', ({ params }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    const account = db.accounts.find((a) => a.id === params.id);
    if (!account || !account.deletedAt) return err(404, 'not_found', 'Deleted account not found.');
    account.deletedAt = undefined;
    account.updatedAt = nowISO();
    account.updatedBy = admin.id;
    persist();
    return json(account);
  }),

  http.delete('/api/admin/trash/contacts/:id', ({ params }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    const index = db.contacts.findIndex((c) => c.id === params.id);
    if (index < 0 || !db.contacts[index].deletedAt)
      return err(404, 'not_found', 'Deleted contact not found.');
    const contact = db.contacts[index];
    const hasLinked =
      db.interactions.some((i) => i.contactId === contact.id) ||
      db.opportunities.some((o) => o.contactId === contact.id) ||
      db.tasks.some((t) => t.contactId === contact.id);
    if (hasLinked) {
      return err(
        409,
        'in_use',
        'This contact still has linked interactions, deals, or tasks. Permanently delete or reassign those records first.',
      );
    }
    db.contacts.splice(index, 1);
    persist();
    return json({ ok: true });
  }),

  http.delete('/api/admin/trash/accounts/:id', ({ params }) => {
    const admin = adminGate();
    if (admin instanceof Response) return admin;
    const db = getDB();
    const index = db.accounts.findIndex((a) => a.id === params.id);
    if (index < 0 || !db.accounts[index].deletedAt)
      return err(404, 'not_found', 'Deleted account not found.');
    const account = db.accounts[index];
    const hasLinked =
      db.contacts.some((c) => c.accountLinks.some((l) => l.accountId === account.id)) ||
      db.opportunities.some((o) => o.accountId === account.id) ||
      db.tasks.some((t) => t.accountId === account.id) ||
      db.interactions.some((i) => i.accountId === account.id);
    if (hasLinked) {
      return err(
        409,
        'in_use',
        'This account still has linked contacts, deals, interactions, or tasks. Permanently delete or reassign those records first.',
      );
    }
    db.accounts.splice(index, 1);
    persist();
    return json({ ok: true });
  }),
];
