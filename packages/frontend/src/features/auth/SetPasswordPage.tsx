// Shared one-time set-password screen for two flows:
//  - /invite/accept   — a newly created user choosing their first password
//  - /reset-password  — a user recovering via a password-reset link
// The backend issues purpose-scoped single-use tokens; a token from one flow
// is rejected by the other.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { ErrorBanner, Spinner } from '../../components/ui/Feedback';
import { BrandLockup } from '../../components/BrandMark';
import { EyeIcon, EyeOffIcon } from '../../components/icons';
import { ApiError } from '../../lib/api';
import { acceptInvitation, confirmPasswordReset } from './authApi';

type Mode = 'invite' | 'reset';

const COPY: Record<
  Mode,
  { title: string; intro: string; submit: string; submitting: string; done: string }
> = {
  invite: {
    title: 'Set up your account',
    intro: 'Welcome! Choose a password to finish setting up your Custotal account.',
    submit: 'Set password',
    submitting: 'Setting password…',
    done: 'Your password is set. You can sign in now.',
  },
  reset: {
    title: 'Choose a new password',
    intro: 'Enter a new password for your account.',
    submit: 'Reset password',
    submitting: 'Resetting password…',
    done: 'Your password has been changed. You can sign in now.',
  },
};

const INVALID_TOKEN =
  'This link is invalid or has expired. Ask your administrator to resend the invitation, or start again from "Forgot password?" on the sign-in page.';

export default function SetPasswordPage({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'password' | 'confirm', string>>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const fe: typeof fieldErrors = {};
    if (password.length < 8) fe.password = 'Password must be at least 8 characters.';
    if (confirm !== password) fe.confirm = 'Passwords do not match.';
    setFormError(null);
    setFieldErrors(fe);
    if (Object.keys(fe).length > 0) return;

    setSubmitting(true);
    const req =
      mode === 'invite' ? acceptInvitation(token, password) : confirmPasswordReset(token, password);
    req
      .then(() => setDone(true))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.code === 'invalid_token') {
          setFormError(INVALID_TOKEN);
          return;
        }
        if (err instanceof ApiError && err.details?.length) {
          const fe: typeof fieldErrors = {};
          err.details.forEach((d) => {
            if (d.field === 'password' || d.field === 'confirm') fe[d.field] = d.message;
          });
          setFieldErrors(fe);
          setFormError(err.message);
          return;
        }
        setFormError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <div className="grid min-h-screen place-items-center p-4 supports-[height:1dvh]:min-h-dvh sm:p-6">
      <div className="w-full max-w-sm animate-fade-up">
        {/* Invite and reset are transactional screens reached from a link rather
            than the product's front door, so the lockup stays horizontal and
            steps one size down from the sign-in hero instead of repeating it. */}
        <BrandLockup size={40} tile className="justify-center" />

        <div className="mt-7 text-center">
          <h1 className="font-display text-26 font-semibold tracking-tight text-ink">
            {copy.title}
          </h1>
          <p className="mt-2 text-15 text-ink-muted">{copy.intro}</p>
        </div>

        {done ? (
          <div
            role="status"
            className="mt-7 rounded-2xl border border-forest/30 bg-forest/5 p-6 text-center"
          >
            <p className="text-sm font-medium text-ink">{copy.done}</p>
            <Button className="mt-4 w-full" onClick={() => navigate('/login', { replace: true })}>
              Go to sign in
            </Button>
          </div>
        ) : !token ? (
          <div className="mt-7 rounded-2xl border border-ink/10 bg-white p-6 text-center shadow-sm">
            <ErrorBanner message={INVALID_TOKEN} />
            <Link
              to="/login"
              className="mt-4 inline-block text-sm font-medium text-forest hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={submit}
            noValidate
            className="mt-7 space-y-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm"
          >
            {formError ? <ErrorBanner message={formError} /> : null}
            <Field
              label="New password"
              htmlFor="new-password"
              required
              error={fieldErrors.password}
            >
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoFocus
                  required
                  invalid={Boolean(fieldErrors.password)}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors({});
                    setFormError(null);
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="tap-target absolute right-2 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-fill hover:text-ink"
                >
                  {showPassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
            </Field>
            <Field
              label="Confirm password"
              htmlFor="confirm-password"
              required
              error={fieldErrors.confirm}
            >
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                invalid={Boolean(fieldErrors.confirm)}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setFieldErrors({});
                  setFormError(null);
                }}
              />
            </Field>
            <Button type="submit" disabled={submitting} aria-busy={submitting} className="w-full">
              {submitting ? (
                <>
                  <Spinner className="size-4" />
                  {copy.submitting}
                </>
              ) : (
                copy.submit
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
