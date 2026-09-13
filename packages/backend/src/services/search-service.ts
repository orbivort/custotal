// Global grouped search (FR-CC-03): substring (ILIKE) match across contacts,
// accounts, opportunities, tasks, and interaction summaries; grouped results with
// counts. Owner-scoped entities respect RBAC visibility.
import { prisma } from '../db.ts';
import { toAccount, toContact, toInteraction, toOpportunity, toTask } from '../serializers.ts';
import type { SearchResults, User } from '../types/domain.ts';

const insensitive = { mode: 'insensitive' as const };

type OwnerKey = 'ownerId' | 'assigneeId' | 'responsibleUserId';

function scope(user: User, key: OwnerKey): Record<string, string> {
  return user.role === 'admin' || user.role === 'manager' || user.role === 'readonly'
    ? {}
    : { [key]: user.id };
}

export async function searchAll(user: User, rawTerm: string, all: boolean): Promise<SearchResults> {
  const term = rawTerm.trim().toLowerCase();
  const limit = all ? 30 : 5;
  const empty = {
    contacts: [],
    accounts: [],
    opportunities: [],
    tasks: [],
    interactions: [],
  };

  if (!term) {
    return {
      ...empty,
      counts: { contacts: 0, accounts: 0, opportunities: 0, tasks: 0, interactions: 0 },
    };
  }

  const contains = (col: string) => ({ [col]: { contains: term, ...insensitive } });

  const contactWhere = {
    deletedAt: null,
    OR: [
      contains('firstName'),
      contains('lastName'),
      contains('email'),
      contains('company'),
      contains('jobTitle'),
    ],
  };
  const accountWhere = {
    deletedAt: null,
    OR: [contains('name'), contains('industry'), contains('website')],
  };
  const oppWhere = {
    deletedAt: null,
    ...scope(user, 'ownerId'),
    OR: [contains('name'), contains('description')],
  };
  const taskWhere = {
    deletedAt: null,
    ...scope(user, 'assigneeId'),
    OR: [contains('title'), contains('description')],
  };
  const interactionWhere = {
    deletedAt: null,
    ...scope(user, 'responsibleUserId'),
    OR: [contains('summary')],
  };

  const [
    contacts,
    accounts,
    opportunities,
    tasks,
    interactions,
    contactCount,
    accountCount,
    opportunityCount,
    taskCount,
    interactionCount,
  ] = await Promise.all([
    prisma.contact.findMany({
      where: contactWhere,
      take: limit,
      include: { accountLinks: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.account.findMany({ where: accountWhere, take: limit, orderBy: { updatedAt: 'desc' } }),
    prisma.opportunity.findMany({ where: oppWhere, take: limit, orderBy: { updatedAt: 'desc' } }),
    prisma.task.findMany({ where: taskWhere, take: limit, orderBy: { updatedAt: 'desc' } }),
    prisma.interaction.findMany({
      where: interactionWhere,
      take: limit,
      orderBy: { dateTime: 'desc' },
    }),
    prisma.contact.count({ where: contactWhere }),
    prisma.account.count({ where: accountWhere }),
    prisma.opportunity.count({ where: oppWhere }),
    prisma.task.count({ where: taskWhere }),
    prisma.interaction.count({ where: interactionWhere }),
  ]);

  return {
    contacts: contacts.map(toContact),
    accounts: accounts.map(toAccount),
    opportunities: opportunities.map(toOpportunity),
    tasks: tasks.map(toTask),
    interactions: interactions.map(toInteraction),
    counts: {
      contacts: contactCount,
      accounts: accountCount,
      opportunities: opportunityCount,
      tasks: taskCount,
      interactions: interactionCount,
    },
  };
}
