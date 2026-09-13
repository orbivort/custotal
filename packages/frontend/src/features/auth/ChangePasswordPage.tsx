// Forced credential-rotation screen. Users created while their invitation
// email could not be delivered hold a temporary credential and are redirected
// here before they can use the app. Changing the password revokes all other
// sessions (FR-CC-09), so the user signs in again afterwards.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { ErrorBanner } from '../../components/ui/Feedback';
import { EyeIcon, EyeOffIcon } from '../../components/icons';
import { ApiError } from '../../lib/api';
import { changePassword } from './authApi';
import { useSession } from './SessionContext';

type FieldErrors = Partial<Record<'currentPassword' | 'newPassword' | 'confirm', string>>;

export default function ChangePasswordPage() {
  const { logout } = useSession();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const fe: FieldErrors = {};
    if (!currentPassword) fe.currentPassword = 'Enter your temporary password.';
    if (newPassword.length < 8) fe.newPassword = 'Password must be at least 8 characters.';
    if (confirm !== newPassword) fe.confirm = 'Passwords do not match.';
    setFormError(null);
    setFieldErrors(fe);
    if (Object.keys(fe).length > 0) return;

    setSubmitting(true);
    changePassword(currentPassword, newPassword)
      .then(() => setDone(true))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.details?.length) {
          const fe: FieldErrors = {};
          err.details.forEach((d) => {
            if (d.field === 'currentPassword' || d.field === 'newPassword') {
              fe[d.field] = d.message;
            }
          });
          setFieldErrors(fe);
          setFormError(err.message);
          return;
        }
        setFormError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      })
      .finally(() => setSubmitting(false));
  }

  async function finish() {
    await logout();
    navigate('/login', { replace: true, state: { passwordChanged: true } });
  }

  return (
    <div className="grid min-h-screen place-items-center p-4 supports-[height:1dvh]:min-h-dvh sm:p-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center">
          <h1 className="font-display text-26 font-semibold tracking-tight text-ink">
            Choose your own password
          </h1>
          <p className="mt-2 text-15 text-ink-muted">
            You're signed in with a temporary password. Set a new one to continue.
          </p>
        </div>

        {done ? (
          <div
            role="status"
            className="mt-7 rounded-2xl border border-forest/30 bg-forest/5 p-6 text-center"
          >
            <p className="text-sm font-medium text-ink">
              Your password has been updated. Please sign in with your new password.
            </p>
            <Button className="mt-4 w-full" onClick={finish}>
              Go to sign in
            </Button>
          </div>
        ) : (
          <form
            onSubmit={submit}
            noValidate
            className="mt-7 space-y-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm"
          >
            {formError ? <ErrorBanner message={formError} /> : null}
            <Field
              label="Temporary password"
              htmlFor="current-password"
              required
              error={fieldErrors.currentPassword}
            >
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                invalid={Boolean(fieldErrors.currentPassword)}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setFieldErrors({});
                  setFormError(null);
                }}
              />
            </Field>
            <Field
              label="New password"
              htmlFor="new-password"
              required
              error={fieldErrors.newPassword}
              hint="At least 8 characters."
            >
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  invalid={Boolean(fieldErrors.newPassword)}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
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
              label="Confirm new password"
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
              {submitting ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
