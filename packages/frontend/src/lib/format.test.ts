import { describe, expect, it } from 'vitest';
import { env } from '../config/env';
import {
  formatCurrency,
  formatPercent,
  greeting,
  isDueToday,
  isOverdue,
  todayISO,
  valueLabel,
} from './format';

describe('formatCurrency', () => {
  it('renders integer minor units as dollars', () => {
    expect(formatCurrency(123456)).toBe('$1,234.56');
  });

  it('renders zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('renders a different currency code', () => {
    expect(formatCurrency(100000, 'EUR')).toContain('€');
  });
});

describe('valueLabel', () => {
  it('suffixes the configured default currency', () => {
    expect(valueLabel('Value')).toBe(`Value (${env.defaultCurrency})`);
  });

  it('uses USD by default when VITE_DEFAULT_CURRENCY is unset', () => {
    expect(env.defaultCurrency).toBe('USD');
    expect(env.defaultCurrencySymbol).toBe('$');
    expect(valueLabel('Total value')).toBe('Total value (USD)');
  });
});

describe('formatPercent', () => {
  it('appends a percent sign', () => {
    expect(formatPercent(50)).toBe('50%');
  });
});

describe('greeting', () => {
  const at = (hour: number) => new Date(2026, 8, 11, hour, 0, 0);

  it('says good morning from 05:00 through 11:59', () => {
    expect(greeting(at(5))).toBe('Good morning');
    expect(greeting(at(11))).toBe('Good morning');
  });

  it('says good afternoon from 12:00 through 17:59', () => {
    expect(greeting(at(12))).toBe('Good afternoon');
    expect(greeting(at(17))).toBe('Good afternoon');
  });

  it('says good evening from 18:00 through 04:59', () => {
    expect(greeting(at(18))).toBe('Good evening');
    expect(greeting(at(23))).toBe('Good evening');
    expect(greeting(at(0))).toBe('Good evening');
    expect(greeting(at(4))).toBe('Good evening');
  });
});

describe('task due-date helpers', () => {
  it('flags a past date as overdue', () => {
    expect(isOverdue('2020-01-01')).toBe(true);
  });

  it('does not flag today as overdue', () => {
    expect(isOverdue(todayISO())).toBe(false);
  });

  it('flags today as due today', () => {
    expect(isDueToday(todayISO())).toBe(true);
  });
});
