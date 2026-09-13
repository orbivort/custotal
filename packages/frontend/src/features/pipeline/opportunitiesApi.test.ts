// Unit tests for the opportunities API service.
//
// Only the HTTP transport (`lib/api`.api) is mocked: every test asserts the
// verb, path, query string, and body a function sends, plus that the decoded
// response is returned untouched. `toQueryString` is kept real so the
// filter-serialization contract (empty values dropped, values encoded) is
// exercised end to end rather than re-implemented in a stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListResult, Opportunity, OpportunityDetail } from '../../types/domain';
import {
  createOpportunity,
  deleteOpportunity,
  getOpportunity,
  listOpportunities,
  moveOpportunityStage,
  updateOpportunity,
  type MoveStageInput,
  type OpportunityInput,
} from './opportunitiesApi';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    toQueryString: actual.toQueryString,
    api: { get: h.get, post: h.post, patch: h.patch, del: h.del },
  };
});

const OPP: Opportunity = {
  id: 'o1',
  name: 'Platform renewal',
  contactId: 'c1',
  accountId: 'a1',
  valueMinor: 250000,
  currency: 'USD',
  expectedCloseDate: '2026-06-30',
  stageId: 's1',
  probability: 30,
  probabilityManual: false,
  ownerId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'u1',
  updatedAt: '2026-01-02T00:00:00Z',
  updatedBy: 'u1',
};

const DETAIL: OpportunityDetail = {
  ...OPP,
  history: [
    {
      id: 'h1',
      opportunityId: 'o1',
      fromStageId: null,
      toStageId: 's1',
      userId: 'u1',
      timestamp: '2026-01-01T00:00:00Z',
    },
  ],
};

const LIST: ListResult<Opportunity> = { items: [OPP], total: 1 };

describe('opportunitiesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue(LIST);
    h.post.mockResolvedValue(OPP);
    h.patch.mockResolvedValue(OPP);
    h.del.mockResolvedValue({ ok: true });
  });

  describe('listOpportunities', () => {
    it('requests the collection endpoint without a query string by default', async () => {
      const result = await listOpportunities();

      expect(h.get).toHaveBeenCalledWith('/api/opportunities');
      expect(result).toBe(LIST);
    });

    it('serializes owner and stage filters into the query string in declaration order', async () => {
      await listOpportunities({ owner: 'u1', stage: 's2' });

      expect(h.get).toHaveBeenCalledWith('/api/opportunities?owner=u1&stage=s2');
    });

    it('omits empty filters so cleared UI state sends no param', async () => {
      await listOpportunities({ owner: '', stage: '' });

      expect(h.get).toHaveBeenCalledWith('/api/opportunities');
    });

    it('omits undefined filters', async () => {
      await listOpportunities({ owner: undefined, stage: 's3' });

      expect(h.get).toHaveBeenCalledWith('/api/opportunities?stage=s3');
    });

    it('percent-encodes filter values containing reserved characters', async () => {
      await listOpportunities({ owner: 'u 1&x' });

      expect(h.get).toHaveBeenCalledWith('/api/opportunities?owner=u+1%26x');
    });

    it('propagates transport failures to the caller', async () => {
      h.get.mockRejectedValueOnce(new Error('unreachable'));

      await expect(listOpportunities()).rejects.toThrow('unreachable');
    });
  });

  describe('getOpportunity', () => {
    it('requests the item endpoint and returns the detail payload', async () => {
      h.get.mockResolvedValueOnce(DETAIL);

      const result = await getOpportunity('o1');

      expect(h.get).toHaveBeenCalledWith('/api/opportunities/o1');
      expect(result).toBe(DETAIL);
    });

    it('still builds a path when the id is an empty string', async () => {
      h.get.mockResolvedValueOnce(DETAIL);

      await getOpportunity('');

      expect(h.get).toHaveBeenCalledWith('/api/opportunities/');
    });

    it('propagates a not-found failure', async () => {
      h.get.mockRejectedValueOnce(new Error('Opportunity not found'));

      await expect(getOpportunity('missing')).rejects.toThrow('Opportunity not found');
    });
  });

  describe('createOpportunity', () => {
    it('posts the input to the collection endpoint and returns the new deal', async () => {
      const input: OpportunityInput = {
        name: 'Platform renewal',
        accountId: 'a1',
        valueMinor: 250000,
        currency: 'USD',
        expectedCloseDate: '2026-06-30',
        stageId: 's1',
        probability: 30,
        probabilityManual: false,
        ownerId: 'u1',
      };

      const result = await createOpportunity(input);

      expect(h.post).toHaveBeenCalledWith('/api/opportunities', input);
      expect(result).toBe(OPP);
    });

    it('posts a minimal payload with only the fields the caller supplies', async () => {
      await createOpportunity({ name: 'New logo', accountId: 'a2' });

      expect(h.post).toHaveBeenCalledWith('/api/opportunities', {
        name: 'New logo',
        accountId: 'a2',
      });
    });

    it('propagates validation failures from the server', async () => {
      h.post.mockRejectedValueOnce(new Error('Account is required.'));

      await expect(createOpportunity({ name: 'No account' })).rejects.toThrow(
        'Account is required.',
      );
    });
  });

  describe('updateOpportunity', () => {
    it('patches the item endpoint with the supplied fields', async () => {
      const input: OpportunityInput = {
        name: 'Renamed deal',
        probability: 60,
        probabilityManual: true,
      };

      const result = await updateOpportunity('o1', input);

      expect(h.patch).toHaveBeenCalledWith('/api/opportunities/o1', input);
      expect(result).toBe(OPP);
    });

    it('patches an empty body when the caller supplies nothing', async () => {
      await updateOpportunity('o1', {});

      expect(h.patch).toHaveBeenCalledWith('/api/opportunities/o1', {});
    });

    it('propagates conflict errors', async () => {
      h.patch.mockRejectedValueOnce(new Error('The record changed since you loaded it.'));

      await expect(updateOpportunity('o1', { name: 'x' })).rejects.toThrow(
        'The record changed since you loaded it.',
      );
    });
  });

  describe('deleteOpportunity', () => {
    it('deletes the item endpoint and resolves without a value', async () => {
      await expect(deleteOpportunity('o1')).resolves.toBeUndefined();

      expect(h.del).toHaveBeenCalledWith('/api/opportunities/o1');
    });

    it('propagates permission failures', async () => {
      h.del.mockRejectedValueOnce(new Error('Forbidden'));

      await expect(deleteOpportunity('o1')).rejects.toThrow('Forbidden');
    });
  });

  describe('moveOpportunityStage', () => {
    it('posts the target stage and the probability choice to the stage endpoint', async () => {
      const input: MoveStageInput = { toStageId: 's2', probabilityChoice: 'default' };

      const result = await moveOpportunityStage('o1', input);

      expect(h.post).toHaveBeenCalledWith('/api/opportunities/o1/stage', input);
      expect(result).toBe(OPP);
    });

    it('sends the manual probability choice when the user keeps their value', async () => {
      await moveOpportunityStage('o1', { toStageId: 's2', probabilityChoice: 'keep' });

      expect(h.post).toHaveBeenCalledWith('/api/opportunities/o1/stage', {
        toStageId: 's2',
        probabilityChoice: 'keep',
      });
    });

    it('sends the loss reason when a deal is marked lost', async () => {
      await moveOpportunityStage('o1', {
        toStageId: 's4',
        probabilityChoice: 'default',
        lossReason: 'Budget frozen',
      });

      expect(h.post).toHaveBeenCalledWith('/api/opportunities/o1/stage', {
        toStageId: 's4',
        probabilityChoice: 'default',
        lossReason: 'Budget frozen',
      });
    });

    it('propagates failures so the board can revert and toast', async () => {
      h.post.mockRejectedValueOnce(new Error('Stage is archived'));

      await expect(moveOpportunityStage('o1', { toStageId: 's9' })).rejects.toThrow(
        'Stage is archived',
      );
    });
  });
});
