/** Read a single query-string value safely (Express 5 types them as string | string[] | ParsedQs | …). */
export function qstr(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/** Read a numeric query-string value with an optional default. */
export function qnum(value: unknown): number | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Read a route param that Express 5 types as string | string[] | undefined. */
export function pstr(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
