// Integration coverage for the scheduled soft-delete purge (FR-CC-05).
// scripts/purge.ts is a thin CLI over purgeExpiredRecords; these tests drive the
// routine directly against the test database. The contract under test is parity
// with the admin trash guards (admin-service.ts): a record is only physically
// removed once nothing references it, and only after the retention window.
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../src/db.ts';
import {
  purgeExpiredRecords,
  SOFT_DELETE_RETENTION_DAYS,
} from '../../../src/services/purge-service.ts';
import { ACCOUNTS, CONTACTS, STAGES, USERS } from '../../fixtures/demo-ids.ts';
import { seedDemoWorkspace } from '../../fixtures/demo-workspace.ts';

const DAY_MS = 86_400_000;
/** Older than the retention window — eligible for purge. */
const expired = () => new Date(Date.now() - (SOFT_DELETE_RETENTION_DAYS + 5) * DAY_MS);
/** Inside the retention window — must be kept even when unreferenced. */
const recent = () => new Date(Date.now() - DAY_MS);

function createOpportunity(name: string, deletedAt: Date | null) {
  return prisma.opportunity.create({
    data: {
      name,
      accountId: ACCOUNTS.acme,
      valueMinor: 1_000,
      expectedCloseDate: new Date(),
      stageId: STAGES.proposal,
      probability: 50,
      ownerId: USERS.alex,
      createdBy: USERS.alex,
      updatedBy: USERS.alex,
      deletedAt,
    },
  });
}

function createTask(
  title: string,
  deletedAt: Date | null,
  refs: { opportunityId?: string; contactId?: string } = {},
) {
  return prisma.task.create({
    data: {
      title,
      assigneeId: USERS.alex,
      accountId: ACCOUNTS.acme,
      opportunityId: refs.opportunityId,
      contactId: refs.contactId,
      createdBy: USERS.alex,
      updatedBy: USERS.alex,
      deletedAt,
    },
  });
}

function createInteraction(
  summary: string,
  deletedAt: Date | null,
  refs: { opportunityId?: string; taskId?: string } = {},
) {
  return prisma.interaction.create({
    data: {
      type: 'note',
      dateTime: new Date(),
      summary,
      contactId: CONTACTS.laura,
      accountId: ACCOUNTS.acme,
      opportunityId: refs.opportunityId,
      taskId: refs.taskId,
      responsibleUserId: USERS.alex,
      createdBy: USERS.alex,
      updatedBy: USERS.alex,
      deletedAt,
    },
  });
}

function createContact(firstName: string, lastName: string, deletedAt: Date | null) {
  return prisma.contact.create({
    data: { firstName, lastName, createdBy: USERS.alex, updatedBy: USERS.alex, deletedAt },
  });
}

function createAccount(name: string, deletedAt: Date | null) {
  return prisma.account.create({
    data: { name, ownerId: USERS.alex, createdBy: USERS.alex, updatedBy: USERS.alex, deletedAt },
  });
}

describe('purgeExpiredRecords (FR-CC-05)', () => {
  beforeAll(() => seedDemoWorkspace());

  it('removes an expired soft-deleted opportunity with no references', async () => {
    const opportunity = await createOpportunity('Purge Orphan Deal', expired());
    await purgeExpiredRecords(prisma);
    expect(await prisma.opportunity.findUnique({ where: { id: opportunity.id } })).toBeNull();
  });

  it('keeps an expired opportunity still referenced by a task', async () => {
    // Regression: the CLI script previously checked interactions only, so a
    // referenced deal was deleted and its task's opportunityId silently nulled.
    const opportunity = await createOpportunity('Purge Blocked By Task', expired());
    await createTask('Blocks deal purge', null, { opportunityId: opportunity.id });
    await purgeExpiredRecords(prisma);
    expect(await prisma.opportunity.findUnique({ where: { id: opportunity.id } })).not.toBeNull();
  });

  it('keeps an expired opportunity still referenced by an interaction', async () => {
    const opportunity = await createOpportunity('Purge Blocked By Interaction', expired());
    await createInteraction('Blocks deal purge', null, { opportunityId: opportunity.id });
    await purgeExpiredRecords(prisma);
    expect(await prisma.opportunity.findUnique({ where: { id: opportunity.id } })).not.toBeNull();
  });

  it('keeps records inside the retention window even when unreferenced', async () => {
    const opportunity = await createOpportunity('Still Inside Window', recent());
    await purgeExpiredRecords(prisma);
    expect(await prisma.opportunity.findUnique({ where: { id: opportunity.id } })).not.toBeNull();
  });

  it('removes an expired task without interactions but keeps one with a linked interaction', async () => {
    const free = await createTask('Purge Free Task', expired());
    const linked = await createTask('Purge Linked Task', expired());
    await createInteraction('Blocks task purge', null, { taskId: linked.id });
    await purgeExpiredRecords(prisma);
    expect(await prisma.task.findUnique({ where: { id: free.id } })).toBeNull();
    expect(await prisma.task.findUnique({ where: { id: linked.id } })).not.toBeNull();
  });

  it('removes an expired soft-deleted interaction', async () => {
    const interaction = await createInteraction('Purge Me', expired());
    await purgeExpiredRecords(prisma);
    expect(await prisma.interaction.findUnique({ where: { id: interaction.id } })).toBeNull();
  });

  it('removes an expired contact with no references but keeps a referenced one', async () => {
    const free = await createContact('Purge', 'Free', expired());
    const linked = await createContact('Purge', 'Linked', expired());
    await createTask('Blocks contact purge', null, { contactId: linked.id });
    await purgeExpiredRecords(prisma);
    expect(await prisma.contact.findUnique({ where: { id: free.id } })).toBeNull();
    expect(await prisma.contact.findUnique({ where: { id: linked.id } })).not.toBeNull();
  });

  it('removes an expired account with no references but keeps a referenced one', async () => {
    const free = await createAccount('Purge Free Account', expired());
    const linked = await createAccount('Purge Linked Account', expired());
    await prisma.opportunity.create({
      data: {
        name: 'Blocks account purge',
        accountId: linked.id,
        valueMinor: 1_000,
        expectedCloseDate: new Date(),
        stageId: STAGES.proposal,
        probability: 50,
        ownerId: USERS.alex,
        createdBy: USERS.alex,
        updatedBy: USERS.alex,
      },
    });
    await purgeExpiredRecords(prisma);
    expect(await prisma.account.findUnique({ where: { id: free.id } })).toBeNull();
    expect(await prisma.account.findUnique({ where: { id: linked.id } })).not.toBeNull();
  });

  it('drains a backlog across batches, skipping blocked records without stalling', async () => {
    // Page size 2 forces multiple batches. A blocked deal sits ahead of the
    // deletable ones in primary-key order (uuidv7 is time-ordered), so the drain
    // must advance past it and still remove the rows that follow instead of
    // re-fetching the blocked page forever.
    const blocked = await createOpportunity('Batch Blocked Deal', expired());
    await createTask('Blocks batch deal', null, { opportunityId: blocked.id });
    const first = await createOpportunity('Batch Deletable Deal 1', expired());
    const second = await createOpportunity('Batch Deletable Deal 2', expired());

    await purgeExpiredRecords(prisma, { batchSize: 2 });

    expect(await prisma.opportunity.findUnique({ where: { id: blocked.id } })).not.toBeNull();
    expect(await prisma.opportunity.findUnique({ where: { id: first.id } })).toBeNull();
    expect(await prisma.opportunity.findUnique({ where: { id: second.id } })).toBeNull();
  });
});
