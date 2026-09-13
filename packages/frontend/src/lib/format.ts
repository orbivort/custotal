import { env } from '../config/env';

const currencyCache = new Map<string, Intl.NumberFormat>();

export function formatCurrency(minor: number, code = env.defaultCurrency): string {
  let fmt = currencyCache.get(code);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    currencyCache.set(code, fmt);
  }
  return fmt.format(minor / 100);
}

/**
 * Suffixes a base label with the configured default currency, e.g.
 * `valueLabel('Value')` -> "Value (USD)". Every currency-annotated label and
 * CSV header derives its "(XXX)" suffix from `env.defaultCurrency` through
 * this helper so UI text can never drift from the persisted currency.
 */
export function valueLabel(base: string): string {
  return `${base} (${env.defaultCurrency})`;
}

export function formatDate(dateOnly: string): string {
  if (!dateOnly) return '—';
  const d = new Date(`${dateOnly}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatPercent(n: number): string {
  return `${n}%`;
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isOverdue(dateOnly?: string): boolean {
  if (!dateOnly) return false;
  return dateOnly < todayISO();
}

export function isDueToday(dateOnly?: string): boolean {
  if (!dateOnly) return false;
  return dateOnly === todayISO();
}

/**
 * Time-of-day salutation for the dashboard header, in local time:
 * 05:00–11:59 -> "Good morning", 12:00–17:59 -> "Good afternoon",
 * 18:00–04:59 -> "Good evening".
 */
export function greeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
