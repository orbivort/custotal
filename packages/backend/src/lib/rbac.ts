// Role-based access control primitives. Enforcement lives in middleware and the
// service layer (deny-by-default). Semantics mirror the frontend mock contract.
import type { Role, User } from '../types/domain.ts';

export const ALL_ROLES: readonly Role[] = ['rep', 'manager', 'admin', 'readonly'];

/** rep | manager | admin may mutate records; readonly cannot. */
export function canEditRole(role: Role): boolean {
  return role === 'admin' || role === 'manager' || role === 'rep';
}

/**
 * Owner-scoped visibility for opportunities, tasks, and interactions.
 * admin / manager / readonly see everything; reps only see their own.
 */
export function canViewOwnerScoped(user: User, ownerId: string): boolean {
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'readonly') return true;
  return ownerId === user.id;
}
