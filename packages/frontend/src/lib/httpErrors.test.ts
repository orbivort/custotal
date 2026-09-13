// Unit tests for the HTTP-status -> user-facing message helper. This is the
// copy shown when an API failure carries no backend error envelope (e.g. a
// proxy's bare 502), so the tests pin the wording and guard against ever
// leaking a raw numeric code into the UI.
import { describe, expect, it } from 'vitest';
import { describeHttpStatus } from './httpErrors';

describe('describeHttpStatus', () => {
  it('maps common client errors to actionable guidance', () => {
    expect(describeHttpStatus(403)).toBe("You don't have permission to do that.");
    expect(describeHttpStatus(404)).toBe("We couldn't find what you were looking for.");
    expect(describeHttpStatus(409)).toBe(
      'This was changed somewhere else. Reload the page and try again.',
    );
    expect(describeHttpStatus(429)).toBe('Too many requests. Please wait a moment and try again.');
  });

  it('maps gateway and server errors to retry guidance', () => {
    expect(describeHttpStatus(500)).toBe('Something went wrong on our end. Please try again.');
    expect(describeHttpStatus(502)).toBe(
      'The server is temporarily unavailable. Please try again in a moment.',
    );
    expect(describeHttpStatus(503)).toBe(
      'The service is temporarily unavailable. Please try again in a moment.',
    );
  });

  it('falls back to a generic message for an unmapped status', () => {
    expect(describeHttpStatus(599)).toBe('Something went wrong. Please try again.');
    expect(describeHttpStatus(0)).toBe('Something went wrong. Please try again.');
  });

  it('never exposes the raw numeric code in the message', () => {
    for (const status of [400, 401, 403, 404, 408, 409, 413, 415, 422, 429, 500, 502, 503, 504]) {
      const message = describeHttpStatus(status);
      expect(message).not.toContain(String(status));
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
