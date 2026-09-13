// Email delivery for invitation and password-reset messages. A single shared
// transport is created lazily on first send and reused. When SMTP is not
// configured (empty smtpHost) or test mode is on (SMTP_TEST_MODE, defaults to
// true under NODE_ENV=test) the mailer degrades to a logged fallback so
// development and test runs stay safe — the message body (which embeds
// one-time set-password links) is only written to logs in development.
// Callers can detect the fallback via `smtpConfigured`.
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config.ts';
import { logger } from '../logger.ts';

let transporter: Transporter | null = null;

/** True when real email delivery is available. */
export function smtpConfigured(): boolean {
  return env.smtp.host !== '' && !env.smtp.testMode;
}

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporter;
}

/**
 * Sends a message. Resolves `true` when the transport accepted it, `false` on
 * any delivery failure (logged, never thrown — email must not break the
 * calling flow).
 */
async function sendMail(options: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!smtpConfigured()) {
    // The body embeds one-time set-password links, so it is only ever logged
    // in local development. Everywhere else the log records that the fallback
    // fired, without the credential-bearing URL.
    if (env.isDevelopment) {
      logger.warn(
        { action: 'mail.skipped', to: options.to, subject: options.subject },
        'SMTP not configured — message body follows:\n' + options.text,
      );
    } else {
      logger.warn(
        { action: 'mail.skipped', subject: options.subject },
        'SMTP not configured — message not delivered (body withheld from logs).',
      );
    }
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: env.smtp.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });
    return true;
  } catch (err: unknown) {
    logger.error(
      {
        action: 'mail.failed',
        // The recipient is only kept in local development diagnostics.
        ...(env.isDevelopment ? { to: options.to } : {}),
        subject: options.subject,
        err,
      },
      'Email delivery failed',
    );
    return false;
  }
}

/** Invitation email for a newly created user; links to the set-password page. */
export function sendInvitation(to: string, name: string, inviteUrl: string): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Set up your Custotal account',
    text: [
      `Hi ${name},`,
      '',
      'An account has been created for you in Custotal.',
      'Set your password to sign in:',
      inviteUrl,
      '',
      'This link expires soon and can be used only once. If you did not expect',
      'this email, you can safely ignore it.',
    ].join('\n'),
  });
}

/** Password-reset email; links to the same set-password page (reset purpose). */
export function sendPasswordReset(to: string, name: string, resetUrl: string): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Reset your Custotal password',
    text: [
      `Hi ${name},`,
      '',
      'A password reset was requested for your Custotal account.',
      'Choose a new password here:',
      resetUrl,
      '',
      'This link expires soon and can be used only once. If you did not request',
      'a reset, you can safely ignore this email — your password is unchanged.',
    ].join('\n'),
  });
}
