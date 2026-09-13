// Dedicated integration/e2e data fixture. Reproduces the demo workspace that the
// frontend mock dataset (packages/frontend/src/mocks/db/seed.ts) models, so the
// API suites can assert known totals against stable ids.
//
// This is TEST-ONLY — the application no longer ships a database seed script.
// Production is bootstrapped with `db:migrate:deploy` + `db:create-admin`, and
// developers who want demo data use the frontend mock mode (VITE_ENABLE_MOCKS),
// whose dataset is the independent source of truth (packages/frontend/src/mocks).
//
// The fixture opens its own client bound to TEST_DATABASE_URL rather than
// importing src/db.ts: the e2e global-setup process still has DATABASE_URL
// pointing at .env, so the server's singleton would target the wrong database.
//
// Idempotent: clears all tables, then recreates the workspace. Demo password:
// demo1234. All id-bearing columns are uuid (@db.Uuid, DB default uuidv7()); rows
// referenced across tables (and asserted in the integration tests) use the stable
// UUID constants from demo-ids.ts, while append-only rows (StageHistory,
// Interaction, TaskCompletion) omit explicit ids and let the DB generate uuidv7().
import { PrismaClient } from '../../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { testDatabaseUrl } from '../support/env.ts';
import { truncateAllTables } from '../support/schema-tables.ts';
import { env } from '../../src/config.ts';
import { ensureDefaultStages } from '../../src/services/stage-service.ts';
import { ACCOUNTS, CONTACTS, OPPORTUNITIES, STAGES, TASKS, USERS } from './demo-ids.ts';

export const DEMO_PASSWORD = 'demo1234';

let passwordHash: string | undefined;

/**
 * Date-only (YYYY-MM-DD) value `offsetDays` from today, in the tenant timezone.
 * Date-only semantics (FR-CC-14) are anchored to `TENANT_TIMEZONE` (default UTC),
 * the same frame `getTaskSummary` uses for "due today" / "overdue". Formatting in
 * that zone — instead of the machine's local clock — keeps the fixture's "today"
 * aligned with the API even when the host runs at a different offset.
 */
function d(offsetDays: number): string {
  const target = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.tenantTimezone }).format(target);
}

function ts(daysAgo: number, hour = 10, minute = 30): Date {
  const dt = new Date(Date.now() - daysAgo * 86400000);
  dt.setUTCHours(hour, minute, 0, 0);
  return dt;
}

/** Recreate the demo workspace in the dedicated test database. */
export async function seedDemoWorkspace(): Promise<void> {
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL (or DATABASE_URL) is required to seed the demo workspace.');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });
  try {
    // Clear in dependency order.
    await truncateAllTables(prisma);

    passwordHash ??= await bcrypt.hash(DEMO_PASSWORD, 10);

    await prisma.user.createMany({
      data: [
        {
          id: USERS.sam,
          name: 'Sam Sample',
          email: 'sam@example.com',
          role: 'admin',
          passwordHash,
        },
        {
          id: USERS.dana,
          name: 'Dana Sample',
          email: 'dana@example.com',
          role: 'manager',
          passwordHash,
        },
        {
          id: USERS.alex,
          name: 'Alex Sample',
          email: 'alex@example.com',
          role: 'rep',
          passwordHash,
        },
        {
          id: USERS.morgan,
          name: 'Morgan Sample',
          email: 'morgan@example.com',
          role: 'rep',
          passwordHash,
        },
        {
          id: USERS.riley,
          name: 'Riley Sample',
          email: 'riley@example.com',
          role: 'readonly',
          passwordHash,
        },
      ],
    });

    // Reuse the same idempotent initializer the API runs on first access, so the
    // fixture data and a fresh deployment always share one definition of the
    // default pipeline (src/lib/default-stages.ts).
    await ensureDefaultStages(prisma);

    await prisma.account.createMany({
      data: [
        {
          id: ACCOUNTS.acme,
          name: 'Alpha Manufacturing',
          industry: 'Industrial',
          website: 'alpha-mfg.example',
          phone: '+1 (555) 555-0142',
          billingAddress: '100 Sample Boulevard, Springfield, CA 94600',
          ownerId: USERS.alex,
          notes: 'Legacy account. Adding two new production lines next quarter.',
          createdAt: ts(140),
          createdBy: USERS.sam,
          updatedAt: ts(3),
          updatedBy: USERS.alex,
        },
        {
          id: ACCOUNTS.northwind,
          name: 'Bravo Distribution',
          industry: 'Wholesale & Distribution',
          website: 'bravo-distribution.example',
          phone: '+1 (555) 555-0178',
          billingAddress: '200 Sample Way, Springfield, WA 98100',
          ownerId: USERS.alex,
          notes: 'Annual contract renews each January.',
          createdAt: ts(200),
          createdBy: USERS.sam,
          updatedAt: ts(6),
          updatedBy: USERS.alex,
        },
        {
          id: ACCOUNTS.globex,
          name: 'Charlie Technology',
          industry: 'Technology',
          website: 'charlie-tech.example',
          phone: '+1 (555) 555-0130',
          billingAddress: '300 Sample Avenue, Springfield, NY 10001',
          ownerId: USERS.morgan,
          notes: 'Evaluating a full platform migration.',
          createdAt: ts(95),
          createdBy: USERS.dana,
          updatedAt: ts(2),
          updatedBy: USERS.morgan,
        },
        {
          id: ACCOUNTS.initech,
          name: 'Delta Software',
          industry: 'Technology',
          website: 'delta-software.example',
          phone: '+1 (555) 555-0155',
          billingAddress: '400 Sample Lane, Springfield, TX 78700',
          ownerId: USERS.alex,
          notes: 'New logo; first engagement this year.',
          createdAt: ts(40),
          createdBy: USERS.alex,
          updatedAt: ts(4),
          updatedBy: USERS.alex,
        },
        {
          id: ACCOUNTS.stark,
          name: 'Echo Aerospace',
          industry: 'Aerospace & Defense',
          website: 'echo-aerospace.example',
          phone: '+1 (555) 555-0111',
          billingAddress: '500 Sample Point, Springfield, CA 90200',
          ownerId: USERS.morgan,
          notes: 'Security review required before procurement.',
          createdAt: ts(75),
          createdBy: USERS.dana,
          updatedAt: ts(1),
          updatedBy: USERS.morgan,
        },
        {
          id: ACCOUNTS.umber,
          name: 'Foxtrot Health',
          industry: 'Healthcare',
          website: 'foxtrot-health.example',
          phone: '+1 (555) 555-0199',
          billingAddress: '600 Sample Avenue, Springfield, IL 60600',
          ownerId: USERS.alex,
          notes: 'Multi-year agreement signed in August.',
          createdAt: ts(160),
          createdBy: USERS.sam,
          updatedAt: ts(20),
          updatedBy: USERS.alex,
        },
        {
          id: ACCOUNTS.hooli,
          name: 'Golf Dynamics',
          industry: 'Technology',
          website: 'golf-dynamics.example',
          phone: '+1 (555) 555-0114',
          billingAddress: '700 Sample Plaza, Springfield, CA 94300',
          ownerId: USERS.morgan,
          notes: 'Closed during quarterly account review.',
          createdAt: ts(70),
          createdBy: USERS.dana,
          updatedAt: ts(6),
          updatedBy: USERS.dana,
          deletedAt: ts(2),
        },
      ],
    });

    await prisma.contact.createMany({
      data: [
        {
          id: CONTACTS.laura,
          firstName: 'Laura',
          lastName: 'Alpha',
          email: 'laura.alpha@example.com',
          phone: '+1 (415) 555-0101',
          jobTitle: 'VP of Operations',
          address: '100 Sample Boulevard, Springfield, CA 94600',
          notes: 'Key decision maker on the equipment refresh.',
          status: 'active',
          createdAt: ts(140),
          createdBy: USERS.sam,
          updatedAt: ts(3),
          updatedBy: USERS.alex,
        },
        {
          id: CONTACTS.marcus,
          firstName: 'Marcus',
          lastName: 'Bravo',
          email: 'marcus.bravo@example.com',
          phone: '+1 (415) 555-0102',
          jobTitle: 'Procurement Lead',
          status: 'active',
          createdAt: ts(138),
          createdBy: USERS.sam,
          updatedAt: ts(12),
          updatedBy: USERS.alex,
        },
        {
          id: CONTACTS.priya,
          firstName: 'Priya',
          lastName: 'Charlie',
          email: 'priya.charlie@example.com',
          phone: '+1 (206) 555-0103',
          jobTitle: 'Director of Partnerships',
          status: 'active',
          createdAt: ts(200),
          createdBy: USERS.sam,
          updatedAt: ts(6),
          updatedBy: USERS.alex,
        },
        {
          id: CONTACTS.jonas,
          firstName: 'Jonas',
          lastName: 'Delta',
          email: 'jonas.delta@example.com',
          phone: '+1 (646) 555-0104',
          jobTitle: 'Chief Technology Officer',
          status: 'active',
          createdAt: ts(95),
          createdBy: USERS.dana,
          updatedAt: ts(2),
          updatedBy: USERS.morgan,
        },
        {
          id: CONTACTS.elena,
          firstName: 'Elena',
          lastName: 'Echo',
          email: 'elena.echo@example.com',
          phone: '+1 (512) 555-0105',
          jobTitle: 'Head of IT',
          status: 'active',
          createdAt: ts(40),
          createdBy: USERS.alex,
          updatedAt: ts(4),
          updatedBy: USERS.alex,
        },
        {
          id: CONTACTS.tunde,
          firstName: 'Tunde',
          lastName: 'Foxtrot',
          email: 'tunde.foxtrot@example.com',
          phone: '+1 (310) 555-0106',
          jobTitle: 'Sourcing Manager',
          status: 'active',
          createdAt: ts(75),
          createdBy: USERS.dana,
          updatedAt: ts(1),
          updatedBy: USERS.morgan,
        },
        {
          id: CONTACTS.grace,
          firstName: 'Grace',
          lastName: 'Golf',
          email: 'grace.golf@example.com',
          phone: '+1 (312) 555-0107',
          jobTitle: 'Operations Director',
          status: 'active',
          createdAt: ts(160),
          createdBy: USERS.sam,
          updatedAt: ts(20),
          updatedBy: USERS.alex,
        },
        {
          id: CONTACTS.omar,
          firstName: 'Omar',
          lastName: 'Hotel',
          email: 'omar.hotel@example.com',
          phone: '+1 (646) 555-0108',
          jobTitle: 'Engineering Manager',
          status: 'inactive',
          createdAt: ts(90),
          createdBy: USERS.dana,
          updatedAt: ts(30),
          updatedBy: USERS.morgan,
        },
        {
          id: CONTACTS.mia,
          firstName: 'Mia',
          lastName: 'Juliett',
          email: 'mia.juliett@example.com',
          phone: '+1 (512) 555-0192',
          jobTitle: 'Facilities Manager',
          status: 'active',
          createdAt: ts(55),
          createdBy: USERS.alex,
          updatedAt: ts(8),
          updatedBy: USERS.alex,
          deletedAt: ts(4),
        },
      ],
    });

    await prisma.contactAccountLink.createMany({
      data: [
        {
          contactId: CONTACTS.laura,
          accountId: ACCOUNTS.acme,
          primary: true,
          role: 'Decision maker',
        },
        {
          contactId: CONTACTS.laura,
          accountId: ACCOUNTS.northwind,
          primary: false,
          role: 'Board advisor',
        },
        {
          contactId: CONTACTS.marcus,
          accountId: ACCOUNTS.acme,
          primary: true,
          role: 'Procurement',
        },
        {
          contactId: CONTACTS.priya,
          accountId: ACCOUNTS.northwind,
          primary: true,
          role: 'Sponsor',
        },
        { contactId: CONTACTS.jonas, accountId: ACCOUNTS.globex, primary: true, role: 'Champion' },
        {
          contactId: CONTACTS.elena,
          accountId: ACCOUNTS.initech,
          primary: true,
          role: 'Evaluator',
        },
        {
          contactId: CONTACTS.tunde,
          accountId: ACCOUNTS.stark,
          primary: true,
          role: 'Decision maker',
        },
        { contactId: CONTACTS.grace, accountId: ACCOUNTS.umber, primary: true, role: 'Sponsor' },
        {
          contactId: CONTACTS.omar,
          accountId: ACCOUNTS.globex,
          primary: true,
          role: 'Technical lead',
        },
        { contactId: CONTACTS.omar, accountId: ACCOUNTS.stark, primary: false, role: 'Consultant' },
        {
          contactId: CONTACTS.mia,
          accountId: ACCOUNTS.initech,
          primary: true,
          role: 'Former contact',
        },
      ],
    });

    await prisma.opportunity.createMany({
      data: [
        {
          id: OPPORTUNITIES.acme,
          name: 'Alpha Q4 Equipment Refresh',
          contactId: CONTACTS.laura,
          accountId: ACCOUNTS.acme,
          valueMinor: 24000000,
          currency: 'USD',
          expectedCloseDate: new Date(`${d(21)}T00:00:00.000Z`),
          stageId: STAGES.proposal,
          probability: 50,
          ownerId: USERS.alex,
          description: 'Four-zone manufacturing equipment refresh across two plants.',
          createdAt: ts(120),
          createdBy: USERS.alex,
          updatedAt: ts(1),
          updatedBy: USERS.alex,
        },
        {
          id: OPPORTUNITIES.northwind,
          name: 'Bravo Annual Contract',
          contactId: CONTACTS.priya,
          accountId: ACCOUNTS.northwind,
          valueMinor: 8650000,
          currency: 'USD',
          expectedCloseDate: new Date(`${d(9)}T00:00:00.000Z`),
          stageId: STAGES.negotiation,
          probability: 60,
          probabilityManual: true,
          ownerId: USERS.alex,
          description: 'Annual distribution agreement with expanded support terms.',
          createdAt: ts(85),
          createdBy: USERS.alex,
          updatedAt: ts(3),
          updatedBy: USERS.alex,
        },
        {
          id: OPPORTUNITIES.globex,
          name: 'Charlie Platform Migration',
          contactId: CONTACTS.jonas,
          accountId: ACCOUNTS.globex,
          valueMinor: 150000000,
          currency: 'USD',
          expectedCloseDate: new Date(`${d(45)}T00:00:00.000Z`),
          stageId: STAGES.qualified,
          probability: 30,
          ownerId: USERS.morgan,
          description: 'Full platform migration across four business units.',
          createdAt: ts(60),
          createdBy: USERS.morgan,
          updatedAt: ts(2),
          updatedBy: USERS.morgan,
        },
        {
          id: OPPORTUNITIES.initech,
          name: 'Delta Expansion Deal',
          contactId: CONTACTS.elena,
          accountId: ACCOUNTS.initech,
          valueMinor: 4200000,
          currency: 'USD',
          expectedCloseDate: new Date(`${d(60)}T00:00:00.000Z`),
          stageId: STAGES.lead,
          probability: 10,
          ownerId: USERS.alex,
          description: 'New-logo engagement; scoping a multi-department rollout.',
          createdAt: ts(20),
          createdBy: USERS.alex,
          updatedAt: ts(4),
          updatedBy: USERS.alex,
        },
        {
          id: OPPORTUNITIES.stark,
          name: 'Echo Vendor Onboarding',
          contactId: CONTACTS.tunde,
          accountId: ACCOUNTS.stark,
          valueMinor: 73000000,
          currency: 'USD',
          expectedCloseDate: new Date(`${d(30)}T00:00:00.000Z`),
          stageId: STAGES.proposal,
          probability: 50,
          ownerId: USERS.morgan,
          description: 'Preferred-vendor onboarding with annual spend commitment.',
          createdAt: ts(50),
          createdBy: USERS.morgan,
          updatedAt: ts(1),
          updatedBy: USERS.morgan,
        },
        {
          id: OPPORTUNITIES.umber,
          name: 'Foxtrot Multi-Year Renewal',
          contactId: CONTACTS.grace,
          accountId: ACCOUNTS.umber,
          valueMinor: 12000000,
          currency: 'USD',
          expectedCloseDate: new Date(`${d(-2)}T00:00:00.000Z`),
          stageId: STAGES.won,
          probability: 100,
          ownerId: USERS.alex,
          description: 'Three-year renewal with expanded service coverage.',
          createdAt: ts(150),
          createdBy: USERS.alex,
          updatedAt: ts(12),
          updatedBy: USERS.alex,
        },
        {
          id: OPPORTUNITIES.northwindPilot,
          name: 'Bravo Pilot Program',
          contactId: CONTACTS.priya,
          accountId: ACCOUNTS.northwind,
          valueMinor: 2800000,
          currency: 'USD',
          expectedCloseDate: new Date(`${d(-20)}T00:00:00.000Z`),
          stageId: STAGES.lost,
          probability: 0,
          ownerId: USERS.alex,
          lossReason: 'Budget reallocated to a competing initiative.',
          description: 'Pilot program proposed ahead of the annual contract.',
          createdAt: ts(110),
          createdBy: USERS.alex,
          updatedAt: ts(20),
          updatedBy: USERS.alex,
        },
      ],
    });

    // StageHistory rows omit explicit ids; the DB generates uuidv7() defaults.
    await prisma.stageHistory.createMany({
      data: [
        {
          opportunityId: OPPORTUNITIES.acme,
          fromStageId: null,
          toStageId: STAGES.lead,
          userId: USERS.alex,
          timestamp: ts(120),
        },
        {
          opportunityId: OPPORTUNITIES.acme,
          fromStageId: STAGES.lead,
          toStageId: STAGES.qualified,
          userId: USERS.alex,
          timestamp: ts(70),
        },
        {
          opportunityId: OPPORTUNITIES.acme,
          fromStageId: STAGES.qualified,
          toStageId: STAGES.proposal,
          userId: USERS.alex,
          timestamp: ts(6),
        },
        {
          opportunityId: OPPORTUNITIES.northwind,
          fromStageId: null,
          toStageId: STAGES.lead,
          userId: USERS.alex,
          timestamp: ts(85),
        },
        {
          opportunityId: OPPORTUNITIES.northwind,
          fromStageId: STAGES.lead,
          toStageId: STAGES.negotiation,
          userId: USERS.alex,
          timestamp: ts(10),
        },
        {
          opportunityId: OPPORTUNITIES.umber,
          fromStageId: null,
          toStageId: STAGES.lead,
          userId: USERS.alex,
          timestamp: ts(150),
        },
        {
          opportunityId: OPPORTUNITIES.umber,
          fromStageId: STAGES.lead,
          toStageId: STAGES.won,
          userId: USERS.alex,
          timestamp: ts(12),
        },
        {
          opportunityId: OPPORTUNITIES.northwindPilot,
          fromStageId: null,
          toStageId: STAGES.lead,
          userId: USERS.alex,
          timestamp: ts(110),
        },
        {
          opportunityId: OPPORTUNITIES.northwindPilot,
          fromStageId: STAGES.lead,
          toStageId: STAGES.lost,
          userId: USERS.alex,
          timestamp: ts(20),
        },
      ],
    });

    // Interaction rows omit explicit ids; the DB generates uuidv7() defaults.
    await prisma.interaction.createMany({
      data: [
        {
          type: 'call',
          dateTime: ts(0, 9, 15),
          direction: 'inbound',
          summary:
            'Laura called to confirm the equipment refresh timeline. She wants the proposal tightened before the board review on the 18th.',
          contactId: CONTACTS.laura,
          accountId: ACCOUNTS.acme,
          opportunityId: OPPORTUNITIES.acme,
          responsibleUserId: USERS.alex,
          createdAt: ts(0, 9, 15),
          createdBy: USERS.alex,
          updatedAt: ts(0, 9, 15),
          updatedBy: USERS.alex,
        },
        {
          type: 'email',
          dateTime: ts(1, 14, 5),
          direction: 'outbound',
          channel: 'Email',
          summary:
            'Sent revised pricing tiers to Marcus, including the three-year maintenance option he asked about.',
          contactId: CONTACTS.marcus,
          accountId: ACCOUNTS.acme,
          opportunityId: OPPORTUNITIES.acme,
          responsibleUserId: USERS.alex,
          createdAt: ts(1, 14, 5),
          createdBy: USERS.alex,
          updatedAt: ts(1, 14, 5),
          updatedBy: USERS.alex,
        },
        {
          type: 'meeting',
          dateTime: ts(2, 11, 0),
          direction: 'outbound',
          channel: 'Video call',
          summary:
            'Walked Jonas through the migration architecture. He raised concerns about data residency and asked for a security addendum.',
          contactId: CONTACTS.jonas,
          accountId: ACCOUNTS.globex,
          opportunityId: OPPORTUNITIES.globex,
          responsibleUserId: USERS.morgan,
          createdAt: ts(2, 11, 0),
          createdBy: USERS.morgan,
          updatedAt: ts(2, 11, 0),
          updatedBy: USERS.morgan,
        },
        {
          type: 'note',
          dateTime: ts(3, 16, 40),
          summary:
            'Priya mentioned the renewal is contingent on a dedicated support engineer being assigned.',
          contactId: CONTACTS.priya,
          accountId: ACCOUNTS.northwind,
          opportunityId: OPPORTUNITIES.northwind,
          responsibleUserId: USERS.alex,
          createdAt: ts(3, 16, 40),
          createdBy: USERS.alex,
          updatedAt: ts(3, 16, 40),
          updatedBy: USERS.alex,
        },
        {
          type: 'call',
          dateTime: ts(4, 10, 20),
          direction: 'outbound',
          summary:
            'Intro call with Elena to scope the Delta expansion. She will share their current vendor contracts next week.',
          contactId: CONTACTS.elena,
          accountId: ACCOUNTS.initech,
          opportunityId: OPPORTUNITIES.initech,
          responsibleUserId: USERS.alex,
          createdAt: ts(4, 10, 20),
          createdBy: USERS.alex,
          updatedAt: ts(4, 10, 20),
          updatedBy: USERS.alex,
        },
        {
          type: 'other',
          dateTime: ts(5, 13, 10),
          summary:
            'Tunde forwarded the Echo security questionnaire. Flagged for legal review before the statement of work is drafted.',
          contactId: CONTACTS.tunde,
          accountId: ACCOUNTS.stark,
          opportunityId: OPPORTUNITIES.stark,
          responsibleUserId: USERS.morgan,
          createdAt: ts(5, 13, 10),
          createdBy: USERS.morgan,
          updatedAt: ts(5, 13, 10),
          updatedBy: USERS.morgan,
        },
        {
          type: 'email',
          dateTime: ts(18, 9, 0),
          direction: 'outbound',
          channel: 'Email',
          summary:
            'Sent Grace the signed multi-year agreement and onboarding checklist for the Foxtrot renewal.',
          contactId: CONTACTS.grace,
          accountId: ACCOUNTS.umber,
          opportunityId: OPPORTUNITIES.umber,
          responsibleUserId: USERS.alex,
          createdAt: ts(18, 9, 0),
          createdBy: USERS.alex,
          updatedAt: ts(18, 9, 0),
          updatedBy: USERS.alex,
        },
        {
          type: 'meeting',
          dateTime: ts(24, 15, 30),
          direction: 'inbound',
          channel: 'In person',
          summary:
            'Onsite visit at Alpha plant. Laura and Marcus toured the new line and confirmed the four-zone scope.',
          contactId: CONTACTS.laura,
          accountId: ACCOUNTS.acme,
          opportunityId: OPPORTUNITIES.acme,
          responsibleUserId: USERS.alex,
          createdAt: ts(24, 15, 30),
          createdBy: USERS.alex,
          updatedAt: ts(24, 15, 30),
          updatedBy: USERS.alex,
        },
      ],
    });

    await prisma.task.createMany({
      data: [
        {
          id: TASKS.t1,
          title: 'Send Alpha proposal deck',
          description: 'Finalize the pricing tiers and attach the revised maintenance schedule.',
          dueDate: new Date(`${d(0)}T00:00:00.000Z`),
          priority: 'high',
          status: 'open',
          assigneeId: USERS.alex,
          accountId: ACCOUNTS.acme,
          opportunityId: OPPORTUNITIES.acme,
          createdAt: ts(2),
          createdBy: USERS.alex,
          updatedAt: ts(2),
          updatedBy: USERS.alex,
        },
        {
          id: TASKS.t2,
          title: 'Follow up with Laura on pricing',
          dueDate: new Date(`${d(-2)}T00:00:00.000Z`),
          priority: 'high',
          status: 'open',
          assigneeId: USERS.alex,
          contactId: CONTACTS.laura,
          accountId: ACCOUNTS.acme,
          createdAt: ts(5),
          createdBy: USERS.alex,
          updatedAt: ts(5),
          updatedBy: USERS.alex,
        },
        {
          id: TASKS.t3,
          title: 'Prepare Bravo contract',
          description: 'Draft the annual contract with the dedicated support engineer clause.',
          dueDate: new Date(`${d(3)}T00:00:00.000Z`),
          priority: 'medium',
          status: 'open',
          assigneeId: USERS.alex,
          accountId: ACCOUNTS.northwind,
          opportunityId: OPPORTUNITIES.northwind,
          createdAt: ts(3),
          createdBy: USERS.alex,
          updatedAt: ts(3),
          updatedBy: USERS.alex,
        },
        {
          id: TASKS.t4,
          title: 'Intro call with Charlie CTO',
          dueDate: new Date(`${d(1)}T00:00:00.000Z`),
          priority: 'medium',
          status: 'open',
          assigneeId: USERS.morgan,
          contactId: CONTACTS.jonas,
          accountId: ACCOUNTS.globex,
          createdAt: ts(1),
          createdBy: USERS.morgan,
          updatedAt: ts(1),
          updatedBy: USERS.morgan,
        },
        {
          id: TASKS.t5,
          title: 'Update Delta CRM notes',
          dueDate: new Date(`${d(5)}T00:00:00.000Z`),
          priority: 'low',
          status: 'completed',
          assigneeId: USERS.alex,
          contactId: CONTACTS.elena,
          accountId: ACCOUNTS.initech,
          completedAt: ts(1),
          completedBy: USERS.alex,
          createdAt: ts(4),
          createdBy: USERS.alex,
          updatedAt: ts(1),
          updatedBy: USERS.alex,
        },
        {
          id: TASKS.t6,
          title: 'Draft Echo statement of work',
          dueDate: new Date(`${d(-1)}T00:00:00.000Z`),
          priority: 'high',
          status: 'open',
          assigneeId: USERS.morgan,
          accountId: ACCOUNTS.stark,
          opportunityId: OPPORTUNITIES.stark,
          createdAt: ts(4),
          createdBy: USERS.morgan,
          updatedAt: ts(4),
          updatedBy: USERS.morgan,
        },
        {
          id: TASKS.t7,
          title: 'Send Foxtrot thank-you note',
          dueDate: new Date(`${d(-3)}T00:00:00.000Z`),
          priority: 'low',
          status: 'completed',
          assigneeId: USERS.alex,
          contactId: CONTACTS.grace,
          accountId: ACCOUNTS.umber,
          completedAt: ts(9),
          completedBy: USERS.alex,
          createdAt: ts(11),
          createdBy: USERS.alex,
          updatedAt: ts(9),
          updatedBy: USERS.alex,
        },
        {
          id: TASKS.t8,
          title: 'Quarterly pipeline review with Dana',
          dueDate: new Date(`${d(7)}T00:00:00.000Z`),
          priority: 'medium',
          status: 'open',
          assigneeId: USERS.morgan,
          createdAt: ts(2),
          createdBy: USERS.morgan,
          updatedAt: ts(2),
          updatedBy: USERS.morgan,
        },
      ],
    });

    await prisma.taskCompletion.createMany({
      data: [
        { taskId: TASKS.t5, completedAt: ts(1), completedBy: USERS.alex },
        { taskId: TASKS.t7, completedAt: ts(9), completedBy: USERS.alex },
      ],
    });
  } finally {
    await prisma.$disconnect();
  }
}
