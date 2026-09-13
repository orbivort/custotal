// Self-service password recovery entry point on the login screen. The backend
// always responds OK (no account enumeration); the confirmation copy reflects
// that. Rate-limit responses surface verbatim so users know to retry later.
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { ErrorBanner } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { ApiError } from '../../lib/api';
import { requestPasswordReset } from './authApi';

export default function ForgotPasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  function reset() {
    setEmail('');
    setEmailError(null);
    setFormError(null);
    setSent(false);
  }

  function close() {
    onClose();
    // Let the closing animation finish before clearing state.
    window.setTimeout(reset, 200);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setEmailError('Email is required.');
      return;
    }
    setFormError(null);
    setEmailError(null);
    setSubmitting(true);
    requestPasswordReset(value)
      .then(() => setSent(true))
      .catch((err: unknown) => {
        setFormError(
          err instanceof ApiError && err.code === 'rate_limited'
            ? err.message
            : err instanceof ApiError
              ? err.message
              : "Can't reach the server. Check your connection and try again.",
        );
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Reset your password"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
          {sent ? null : (
            <Button onClick={submit} disabled={submitting} aria-busy={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>
          )}
        </>
      }
    >
      {sent ? (
        <div role="status" className="space-y-2 text-sm text-ink-muted">
          <p className="font-medium text-ink">Check your inbox</p>
          <p>
            If an account exists for <span className="font-medium text-ink">{email.trim()}</span>,
            we've sent a link to choose a new password. The link expires soon and works only once.
          </p>
          <p className="text-ink-faint">
            Didn't get it? Check your spam folder, or ask your administrator for help.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {formError ? <ErrorBanner message={formError} /> : null}
          <Field label="Email" htmlFor="forgot-email" required error={emailError ?? undefined}>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              invalid={Boolean(emailError)}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
                setFormError(null);
              }}
              placeholder="you@example.com"
            />
          </Field>
          <p className="text-xs text-ink-faint">We'll email you a link to choose a new password.</p>
        </form>
      )}
    </Modal>
  );
}
