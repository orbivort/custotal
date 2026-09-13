// Unit tests for the RBAC primitives. Pure unit tests with no mocks: the User
// argument is a plain wire-shaped object. Coverage is exhaustive per role
// because these two predicates are the single source of truth for
// deny-by-default enforcement in the middleware and service layers.
import { describe, expect, it } from 'vitest';
import { ALL_ROLES, canEditRole, canViewOwnerScoped } from '../../../src/lib/rbac.ts';
import type { Role, User } from '../../../src/types/domain.ts';

// Mixed-case hex so the exact-match assertions are meaningful.
const OWNER_ID = 'a1b2c3d4-1111-4111-8111-1111111111ab';
const OTHER_ID = 'e5f6a7b8-2222-4222-8222-2222222222cd';

function user(role: Role, id = OWNER_ID): User {
  return { id, name: `${role} user`, email: `${role}@test.example`, role };
}

describe('ALL_ROLES', () => {
  it('lists exactly the four supported roles', () => {
    expect(ALL_ROLES).toEqual(['rep', 'manager', 'admin', 'readonly']);
  });

  it('contains no duplicates', () => {
    expect(new Set(ALL_ROLES).size).toBe(ALL_ROLES.length);
  });
});

describe('canEditRole', () => {
  it.each([
    ['admin', true],
    ['manager', true],
    ['rep', true],
    ['readonly', false],
  ] as const)('returns %s -> %s', (role, expected) => {
    expect(canEditRole(role)).toBe(expected);
  });

  it('denies unknown roles (deny-by-default for values outside the union)', () => {
    expect(canEditRole('auditor' as Role)).toBe(false);
    expect(canEditRole('' as Role)).toBe(false);
  });

  it('covers every role in ALL_ROLES', () => {
    const allowed = ALL_ROLES.filter((role) => canEditRole(role));
    expect(allowed).toEqual(['rep', 'manager', 'admin']);
  });
});

describe('canViewOwnerScoped', () => {
  it.each(['admin', 'manager', 'readonly'] as const)('%s sees records owned by anyone', (role) => {
    expect(canViewOwnerScoped(user(role), OTHER_ID)).toBe(true);
    expect(canViewOwnerScoped(user(role), OWNER_ID)).toBe(true);
  });

  it('a rep sees their own records', () => {
    expect(canViewOwnerScoped(user('rep', OWNER_ID), OWNER_ID)).toBe(true);
  });

  it('a rep cannot see records owned by someone else', () => {
    expect(canViewOwnerScoped(user('rep', OWNER_ID), OTHER_ID)).toBe(false);
  });

  it('matches owner ids exactly (no case-insensitive or partial match)', () => {
    expect(canViewOwnerScoped(user('rep', OWNER_ID), OWNER_ID.toUpperCase())).toBe(false);
    expect(canViewOwnerScoped(user('rep', OWNER_ID), OWNER_ID.slice(0, -1))).toBe(false);
  });

  it('denies a rep when the owner id is empty', () => {
    expect(canViewOwnerScoped(user('rep', OWNER_ID), '')).toBe(false);
  });

  it('denies an unknown role unless the record is their own', () => {
    const auditor = { ...user('rep', OWNER_ID), role: 'auditor' as Role };
    expect(canViewOwnerScoped(auditor, OTHER_ID)).toBe(false);
    expect(canViewOwnerScoped(auditor, OWNER_ID)).toBe(true);
  });
});
