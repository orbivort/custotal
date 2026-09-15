// Email validation shared by the contact form and the mock handlers. It mirrors
// `packages/backend/src/lib/validation.ts` so the form, the MSW mocks, and the
// API accept exactly the same addresses.

/** RFC 5321 §4.5.3.1.3 mailbox limit (local-part + "@" + domain). */
export const EMAIL_MAX_LENGTH = 254;

/** Local part: non-empty and free of whitespace (the "@" was already split off). */
const EMAIL_LOCAL_RE = /^\S+$/;

/** One domain label: non-empty, and neither whitespace nor the "." separator. */
const EMAIL_LABEL_RE = /^[^\s@.]+$/;

/**
 * Shape and length check for a trimmed email address.
 *
 * A length cap plus a split on "." rather than a single pattern: "at least one
 * dot in the domain" can only be written as a repeated group
 * (`(?:label\.)+label`), which a tool like ESLint's `security/detect-unsafe-regex`
 * has to treat as ambiguous quantifiers. This form is strictly linear in the
 * (capped) input and keeps the rules explicit.
 */
export function isValidEmail(value: string): boolean {
  if (value.length === 0 || value.length > EMAIL_MAX_LENGTH) return false;
  const at = value.indexOf('@');
  // Exactly one "@", and something before it.
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  if (!EMAIL_LOCAL_RE.test(value.slice(0, at))) return false;
  const labels = value.slice(at + 1).split('.');
  // A domain needs at least two labels, and none of them may be empty.
  return labels.length > 1 && labels.every((label) => EMAIL_LABEL_RE.test(label));
}
