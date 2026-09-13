// Central, typed access to the Vite environment variables that govern how the
// app talks to its backend. The HTTP client, the MSW bootstrap gate, and the
// data-fetching hooks all read from here so there is a single source of truth.
//
// Variables are parsed defensively: unset or empty values fall back to the
// documented defaults instead of throwing.
//
// Relevant .env variables (see packages/frontend/.env.example):
//   - VITE_ENABLE_MOCKS        opt into Mock Service Worker in development only
//   - VITE_API_BASE_URL        absolute base URL for the real backend (optional;
//                              empty means "same origin", routed via the Vite
//                              dev proxy in development)
//   - VITE_DEFAULT_CURRENCY    ISO 4217 code for the app-wide default currency
//                              (drives the "Value (XXX)" labels and the currency
//                              persisted with new deals; defaults to "USD")

function readBool(value: string | boolean | undefined): boolean {
  if (value === undefined || value === '') return false;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function stripTrailingSlashes(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export interface EnvConfig {
  /** True when running under the Vite dev server. */
  readonly isDev: boolean;
  /**
   * Whether Mock Service Worker should boot. Only possible in development and
   * requires `VITE_ENABLE_MOCKS === 'true'`. Defaults to false: the app talks
   * to the real backend unless a developer explicitly opts into mock data.
   */
  readonly mocksEnabled: boolean;
  /**
   * Effective API origin prefix applied by the HTTP client. Empty string means
   * "same origin" — in development the Vite dev proxy forwards /api to the
   * backend; in deployed builds the backend is served from the same origin.
   * Forced back to '' whenever mocks are enabled so MSW handlers (which match
   * relative /api/* paths) keep intercepting traffic.
   */
  readonly apiBaseUrl: string;
  /**
   * ISO 4217 currency code (e.g. "USD", "EUR") used as the app-wide default.
   * Derived UI never hardcodes a currency: labels such as `Value (USD)` are
   * built from this value and new deals persist it as their currency, so the
   * displayed label and the stored data can never drift apart.
   */
  readonly defaultCurrency: string;
  /**
   * Currency symbol resolved from `defaultCurrency` via Intl (e.g. "$", "€").
   * Falls back to the raw code when Intl cannot resolve it, so callers always
   * get a displayable string.
   */
  readonly defaultCurrencySymbol: string;
}

/** Accepts only well-formed ISO 4217 codes; anything else falls back to USD. */
function resolveDefaultCurrency(): string {
  const raw = String(import.meta.env.VITE_DEFAULT_CURRENCY ?? '')
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : 'USD';
}

/** Resolves the Intl symbol for a currency code, falling back to the code. */
function resolveCurrencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const symbol = parts.find((p) => p.type === 'currency')?.value;
    return symbol && symbol !== code ? symbol : code;
  } catch {
    return code;
  }
}

const mocksEnabled = import.meta.env.DEV && readBool(import.meta.env.VITE_ENABLE_MOCKS);
const rawBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '');

const defaultCurrency = resolveDefaultCurrency();

export const env: EnvConfig = {
  isDev: import.meta.env.DEV,
  mocksEnabled,
  apiBaseUrl: mocksEnabled ? '' : stripTrailingSlashes(rawBaseUrl),
  defaultCurrency,
  defaultCurrencySymbol: resolveCurrencySymbol(defaultCurrency),
};
