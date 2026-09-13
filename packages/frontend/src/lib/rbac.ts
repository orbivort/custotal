import type { Role, User } from '../types/domain';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  rep: 'Sales Rep',
  readonly: 'Read-Only',
};

export const ALL_ROLES: Role[] = ['rep', 'manager', 'admin', 'readonly'];

export function canWrite(user: User | null): boolean {
  return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'rep';
}
