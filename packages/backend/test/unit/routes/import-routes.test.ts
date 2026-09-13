// Unit tests for the CSV import routes (FR-CC-14). Pure unit tests: the service
// layer is mocked and Prisma is stubbed so the real requireAdmin gate loads
// without a database. Focus is on entity / duplicate-policy coercion, which is
// the only logic the route layer owns.
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db.ts', () => ({
  prisma: { session: { findFirst: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../../src/services/import-service.ts', () => ({
  listTemplates: vi.fn(),
  saveTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  dryRun: vi.fn(),
  commitImport: vi.fn(),
}));

import * as importService from '../../../src/services/import-service.ts';
import { requireAdmin } from '../../../src/middleware/auth.ts';
import { importRouter } from '../../../src/routes/import-routes.ts';
import { call, routerGuards } from '../../support/mocks/router.ts';
import type { User } from '../../../src/types/domain.ts';

const service = importService as unknown as Record<keyof typeof importService, Mock>;

const admin: User = { id: 'admin-1', name: 'Root', email: 'root@example.com', role: 'admin' };
const template = { id: 'tpl-1', name: 'Default', entity: 'contact' };
const dryRunResult = { total: 2, valid: 2, invalid: 0, rows: [] };
const commitResult = { created: 2, updated: 0, skipped: 0 };
const records = [{ firstName: 'Ada' }, { firstName: 'Bob' }];

beforeEach(() => {
  vi.clearAllMocks();
  service.listTemplates.mockResolvedValue([template]);
  service.saveTemplate.mockResolvedValue(template);
  service.deleteTemplate.mockResolvedValue(undefined);
  service.dryRun.mockResolvedValue(dryRunResult);
  service.commitImport.mockResolvedValue(commitResult);
});

describe('route guards', () => {
  it('requires administrator access for every import route', () => {
    expect(routerGuards(importRouter)).toContain(requireAdmin);
  });
});

describe('GET /api/import/templates', () => {
  it('filters templates by entity when one is supplied', async () => {
    const { res, done } = call(importRouter, 'get', '/templates', {
      user: admin,
      query: { entity: 'account' },
    });
    await done;

    expect(service.listTemplates).toHaveBeenCalledWith('account');
    expect(res.body).toEqual({ items: [template] });
  });

  it('lists every template when entity is missing or not a string', async () => {
    await call(importRouter, 'get', '/templates', { user: admin }).done;
    expect(service.listTemplates).toHaveBeenLastCalledWith(undefined);

    await call(importRouter, 'get', '/templates', {
      user: admin,
      query: { entity: ['contact', 'account'] },
    }).done;
    expect(service.listTemplates).toHaveBeenLastCalledWith(undefined);
  });
});

describe('POST /api/import/templates', () => {
  it('saves the template and answers 201', async () => {
    const body = { name: 'Default', entity: 'contact', mapping: {} };
    const { res, done } = call(importRouter, 'post', '/templates', { body, user: admin });
    await done;

    expect(service.saveTemplate).toHaveBeenCalledWith(body);
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe(template);
  });

  it('coerces a missing body to an empty object', async () => {
    const { done } = call(importRouter, 'post', '/templates', { user: admin });
    await done;

    expect(service.saveTemplate).toHaveBeenCalledWith({});
  });
});

describe('DELETE /api/import/templates/:id', () => {
  it('deletes the template and acknowledges', async () => {
    const { res, done } = call(importRouter, 'delete', '/templates/:id', {
      params: { id: 'tpl-1' },
      user: admin,
    });
    await done;

    expect(service.deleteTemplate).toHaveBeenCalledWith('tpl-1');
    expect(res.body).toEqual({ ok: true });
  });
});

describe('POST /api/import/dry-run', () => {
  it('previews an account import when entity is account', async () => {
    const { res, done } = call(importRouter, 'post', '/dry-run', {
      user: admin,
      body: { entity: 'account', records },
    });
    await done;

    expect(service.dryRun).toHaveBeenCalledWith('account', records);
    expect(res.body).toBe(dryRunResult);
  });

  it('defaults the entity to contact for anything else', async () => {
    await call(importRouter, 'post', '/dry-run', { user: admin, body: { records } }).done;
    expect(service.dryRun).toHaveBeenLastCalledWith('contact', records);

    await call(importRouter, 'post', '/dry-run', { user: admin, body: { entity: 'nope', records } })
      .done;
    expect(service.dryRun).toHaveBeenLastCalledWith('contact', records);
  });

  it('treats a missing or non-array records payload as empty', async () => {
    await call(importRouter, 'post', '/dry-run', { user: admin }).done;
    expect(service.dryRun).toHaveBeenLastCalledWith('contact', []);

    await call(importRouter, 'post', '/dry-run', { user: admin, body: { records: 'not-an-array' } })
      .done;
    expect(service.dryRun).toHaveBeenLastCalledWith('contact', []);
  });
});

describe('POST /api/import/commit', () => {
  it('commits with the requested duplicate policy and records the acting admin', async () => {
    const { res, done } = call(importRouter, 'post', '/commit', {
      user: admin,
      body: { entity: 'account', records, duplicate: 'overwrite' },
    });
    await done;

    expect(service.commitImport).toHaveBeenCalledWith('account', records, 'overwrite', admin);
    expect(res.body).toBe(commitResult);
  });

  it('defaults to skipping duplicates', async () => {
    const { done } = call(importRouter, 'post', '/commit', { user: admin, body: { records } });
    await done;

    expect(service.commitImport).toHaveBeenCalledWith('contact', records, 'skip', admin);
  });

  it('defaults entity, records and policy when the body is empty', async () => {
    const { done } = call(importRouter, 'post', '/commit', { user: admin });
    await done;

    expect(service.commitImport).toHaveBeenCalledWith('contact', [], 'skip', admin);
  });

  it('propagates import failures to the error handler', async () => {
    const failure = new Error('Import failed.');
    service.commitImport.mockRejectedValue(failure);
    const { res, done } = call(importRouter, 'post', '/commit', { user: admin, body: { records } });

    await expect(done).rejects.toBe(failure);
    expect(res.body).toBeUndefined();
  });
});
