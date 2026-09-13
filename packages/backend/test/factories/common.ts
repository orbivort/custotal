// Synthetic audit actor shared by factories. Audit references (ownerId /
// createdBy / updatedBy / assigneeId) are plain uuid columns in the schema
// (deliberately not FKs — see prisma/schema.prisma), so a stable constant is
// valid and avoids creating throwaway User rows for every factory call.
export const AUDIT_ACTOR = '00000000-0000-4000-8000-0000000000ff';

let factorySequence = 0;

/** Monotonic per-process counter for unique default names/emails. */
export function nextSequence(): number {
  factorySequence += 1;
  return factorySequence;
}
