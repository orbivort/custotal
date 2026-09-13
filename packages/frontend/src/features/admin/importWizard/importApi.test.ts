// Unit tests for the CSV import wizard API service.
//
// The HTTP transport (`lib/api`.api) is mocked while `toQueryString` stays
// real so the entity filter serialization contract is exercised end to end.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportMappingTemplate } from '../../../types/domain';
import {
  deleteImportTemplate,
  importCommit,
  importDryRun,
  listImportTemplates,
  saveImportTemplate,
} from './importApi';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/api')>('../../../lib/api');
  return {
    toQueryString: actual.toQueryString,
    ApiError: actual.ApiError,
    api: { get: h.get, post: h.post, patch: h.patch, del: h.del },
  };
});

const TEMPLATE: ImportMappingTemplate = {
  id: 't1',
  entity: 'contact',
  name: 'Newsletter signups',
  mapping: { 'First name': 'firstName', email: 'email' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

describe('importApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue({ items: [] });
    h.post.mockResolvedValue(undefined);
    h.del.mockResolvedValue({ ok: true });
  });

  describe('listImportTemplates', () => {
    it('requests templates for a given entity', async () => {
      const templates = [TEMPLATE];
      h.get.mockResolvedValueOnce({ items: templates });

      const result = await listImportTemplates('contact');

      expect(h.get).toHaveBeenCalledWith('/api/import/templates?entity=contact');
      expect(result).toBe(templates);
    });

    it('omits the entity filter when none is supplied', async () => {
      await listImportTemplates();

      expect(h.get).toHaveBeenCalledWith('/api/import/templates');
    });

    it('propagates request failures', async () => {
      h.get.mockRejectedValueOnce(new Error('Server error'));

      await expect(listImportTemplates('account')).rejects.toThrow('Server error');
    });
  });

  describe('saveImportTemplate', () => {
    it('posts the template input to the collection endpoint', async () => {
      h.post.mockResolvedValueOnce(TEMPLATE);
      const input = {
        entity: 'contact' as const,
        name: 'Newsletter signups',
        mapping: { 'First name': 'firstName', email: 'email' },
      };

      const result = await saveImportTemplate(input);

      expect(h.post).toHaveBeenCalledWith('/api/import/templates', input);
      expect(result).toBe(TEMPLATE);
    });

    it('propagates validation failures from the server', async () => {
      h.post.mockRejectedValueOnce(new Error('Template name is required.'));

      await expect(saveImportTemplate({})).rejects.toThrow('Template name is required.');
    });
  });

  describe('deleteImportTemplate', () => {
    it('deletes the template endpoint and resolves without a value', async () => {
      await expect(deleteImportTemplate('t1')).resolves.toBeUndefined();

      expect(h.del).toHaveBeenCalledWith('/api/import/templates/t1');
    });

    it('propagates failures so the UI can surface an error toast', async () => {
      h.del.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(deleteImportTemplate('t1')).rejects.toThrow('Delete failed');
    });
  });

  describe('importDryRun', () => {
    it('posts the entity and records to the dry-run endpoint', async () => {
      const result = {
        entity: 'contact' as const,
        rows: [],
        validCount: 0,
        errorCount: 0,
      };
      h.post.mockResolvedValueOnce(result);
      const records = [{ firstName: 'Ada', lastName: 'Lovelace' }];

      const res = await importDryRun('contact', records);

      expect(h.post).toHaveBeenCalledWith('/api/import/dry-run', { entity: 'contact', records });
      expect(res).toBe(result);
    });

    it('propagates server-side validation failures', async () => {
      h.post.mockRejectedValueOnce(new Error('Unsupported field: foo'));

      await expect(importDryRun('account', [{}])).rejects.toThrow('Unsupported field: foo');
    });
  });

  describe('importCommit', () => {
    it('posts entity, records, and the duplicate policy to the commit endpoint', async () => {
      const summary = { entity: 'contact' as const, created: 1, updated: 0, skipped: 0, failed: 0 };
      h.post.mockResolvedValueOnce(summary);
      const records = [{ firstName: 'Ada', lastName: 'Lovelace' }];

      const result = await importCommit('contact', records, 'overwrite');

      expect(h.post).toHaveBeenCalledWith('/api/import/commit', {
        entity: 'contact',
        records,
        duplicate: 'overwrite',
      });
      expect(result).toBe(summary);
    });

    it('propagates commit failures to the caller', async () => {
      h.post.mockRejectedValueOnce(new Error('Import failed'));

      await expect(importCommit('contact', [], 'skip')).rejects.toThrow('Import failed');
    });
  });
});
