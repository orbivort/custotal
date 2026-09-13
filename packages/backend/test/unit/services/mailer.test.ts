// Unit tests for the email mailer (invitation / password-reset delivery).
// `nodemailer`, the env config, and the logger are mocked, so these tests are
// pure unit tests: no SMTP connection is ever opened. They assert the observable
// behaviour — the `smtpConfigured` gate, the credential-safe logged fallback,
// lazy transport creation/reuse, and success/failure reporting.
//
// The module caches its transport in a module-level variable, so every test
// reloads the module (vi.resetModules + dynamic import) to start from a null
// transport. `env`/`logger`/`createTransport` are held in vi.hoisted state so
// the hoisted vi.mock factories can close over the very same objects.
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mocks = vi.hoisted(() => {
  const env = {
    isDevelopment: false,
    smtp: {
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: 'Custotal <no-reply@custotal.local>',
      testMode: true,
    },
  };
  return {
    env,
    logger: { warn: vi.fn(), error: vi.fn() },
    createTransport: vi.fn(),
    sendMail: vi.fn(),
  };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
  createTransport: mocks.createTransport,
}));

vi.mock('../../../src/config.ts', () => ({ env: mocks.env }));

vi.mock('../../../src/logger.ts', () => ({ logger: mocks.logger }));

type Mailer = typeof import('../../../src/services/mailer.ts');

// Default SMTP state, restored before each test so cases never leak into others.
const DEFAULT_SMTP = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  pass: '',
  from: 'Custotal <no-reply@custotal.local>',
  testMode: true,
} as const;

let mailer: Mailer;
let sendMail: Mock;

/** Marks the mailer "really configured" so the transport path is exercised. */
function configureSmtp(): void {
  mocks.env.smtp.host = 'smtp.example.com';
  mocks.env.smtp.testMode = false;
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.env.isDevelopment = false;
  Object.assign(mocks.env.smtp, DEFAULT_SMTP);
  sendMail = mocks.sendMail as unknown as Mock;
  mocks.createTransport.mockReturnValue({ sendMail });
  // Fresh module instance = fresh (null) cached transporter.
  vi.resetModules();
  mailer = await import('../../../src/services/mailer.ts');
});

describe('smtpConfigured', () => {
  it('is false when no host is set', () => {
    mocks.env.smtp.host = '';
    mocks.env.smtp.testMode = false;
    expect(mailer.smtpConfigured()).toBe(false);
  });

  it('is false when test mode is on even with a host configured', () => {
    mocks.env.smtp.host = 'smtp.example.com';
    mocks.env.smtp.testMode = true;
    expect(mailer.smtpConfigured()).toBe(false);
  });

  it('is true when a host is set and test mode is off', () => {
    configureSmtp();
    expect(mailer.smtpConfigured()).toBe(true);
  });
});

describe('sendMail fallback when SMTP is not configured', () => {
  it('returns false and withholds the body outside development', async () => {
    mocks.env.smtp.host = '';
    mocks.env.isDevelopment = false;

    await expect(
      mailer.sendInvitation('ada@example.com', 'Ada', 'https://app/invite'),
    ).resolves.toBe(false);

    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);

    const [meta, message] = mocks.logger.warn.mock.calls[0];
    expect(meta).toEqual({ action: 'mail.skipped', subject: 'Set up your Custotal account' });
    expect(message).toContain('body withheld');
    // The one-time set-password link must never reach non-dev logs.
    expect(JSON.stringify(mocks.logger.warn.mock.calls[0])).not.toContain('https://app/invite');
  });

  it('returns false and logs the body in development', async () => {
    mocks.env.smtp.host = '';
    mocks.env.isDevelopment = true;

    await expect(
      mailer.sendPasswordReset('ada@example.com', 'Ada', 'https://app/reset'),
    ).resolves.toBe(false);

    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    const [meta, message] = mocks.logger.warn.mock.calls[0];
    expect(meta).toEqual({
      action: 'mail.skipped',
      to: 'ada@example.com',
      subject: 'Reset your Custotal password',
    });
    expect(message).toContain('https://app/reset');
  });

  it('treats test mode as unconfigured even with a host set', async () => {
    mocks.env.smtp.host = 'smtp.example.com';
    mocks.env.smtp.testMode = true;

    await expect(
      mailer.sendInvitation('ada@example.com', 'Ada', 'https://app/invite'),
    ).resolves.toBe(false);
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
});

describe('sendMail with a configured transport', () => {
  beforeEach(() => {
    configureSmtp();
    sendMail.mockResolvedValue({ accepted: ['ada@example.com'] });
  });

  it('sends the invitation and reports success', async () => {
    await expect(
      mailer.sendInvitation('ada@example.com', 'Ada', 'https://app/invite'),
    ).resolves.toBe(true);

    expect(mocks.createTransport).toHaveBeenCalledTimes(1);
    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: undefined,
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const payload = sendMail.mock.calls[0][0];
    expect(payload.from).toBe('Custotal <no-reply@custotal.local>');
    expect(payload.to).toBe('ada@example.com');
    expect(payload.subject).toBe('Set up your Custotal account');
    expect(payload.text).toContain('Hi Ada,');
    expect(payload.text).toContain('https://app/invite');
    expect(mocks.logger.warn).not.toHaveBeenCalled();
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('sends the password reset with its own subject and body', async () => {
    await expect(
      mailer.sendPasswordReset('ada@example.com', 'Ada', 'https://app/reset'),
    ).resolves.toBe(true);

    const payload = sendMail.mock.calls[0][0];
    expect(payload.subject).toBe('Reset your Custotal password');
    expect(payload.text).toContain('A password reset was requested');
    expect(payload.text).toContain('https://app/reset');
  });

  it('passes credentials when an SMTP user is configured', async () => {
    mocks.env.smtp.user = 'bot';
    mocks.env.smtp.pass = 'secret';

    await mailer.sendInvitation('ada@example.com', 'Ada', 'https://app/invite');

    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: 'bot', pass: 'secret' } }),
    );
  });

  it('creates the transport once and reuses it across sends', async () => {
    await mailer.sendInvitation('ada@example.com', 'Ada', 'https://app/invite');
    await mailer.sendPasswordReset('ada@example.com', 'Ada', 'https://app/reset');

    expect(mocks.createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});

describe('sendMail delivery failures', () => {
  beforeEach(() => {
    configureSmtp();
    sendMail.mockRejectedValue(new Error('smtp down'));
  });

  it('returns false and logs the error without the recipient outside development', async () => {
    mocks.env.isDevelopment = false;

    await expect(
      mailer.sendInvitation('ada@example.com', 'Ada', 'https://app/invite'),
    ).resolves.toBe(false);

    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).not.toHaveBeenCalled();
    const [meta, message] = mocks.logger.error.mock.calls[0];
    expect(meta).toMatchObject({
      action: 'mail.failed',
      subject: 'Set up your Custotal account',
    });
    expect(meta).not.toHaveProperty('to');
    expect(meta.err).toBeInstanceOf(Error);
    expect(message).toBe('Email delivery failed');
  });

  it('includes the recipient in development diagnostics', async () => {
    mocks.env.isDevelopment = true;

    await expect(
      mailer.sendPasswordReset('ada@example.com', 'Ada', 'https://app/reset'),
    ).resolves.toBe(false);

    const [meta] = mocks.logger.error.mock.calls[0];
    expect(meta).toMatchObject({
      action: 'mail.failed',
      to: 'ada@example.com',
      subject: 'Reset your Custotal password',
    });
  });
});
