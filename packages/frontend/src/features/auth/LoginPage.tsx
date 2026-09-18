import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { ErrorBanner, Spinner } from '../../components/ui/Feedback';
import { BrandLockup } from '../../components/BrandMark';
import { EyeIcon, EyeOffIcon, ServerIcon } from '../../components/icons';
import { env } from '../../config/env';
import { ApiError } from '../../lib/api';
import ForgotPasswordModal from './ForgotPasswordModal';
import { useSession } from './SessionContext';
import { useInstanceStatus } from './useInstanceStatus';

// Every pre-auth state renders the same centring shell. The height is capped
// against the *dynamic* viewport where the engine supports it: `100vh`
// overshoots while a mobile browser shows its address bar, which pushes the
// centred card out of the visible area.
const SHELL = 'grid min-h-screen place-items-center p-4 supports-[height:1dvh]:min-h-dvh sm:p-6';

// Credentials for the seeded mock workspace: the mock login accepts one shared
// password for every seeded account, and `admin@example.com` is the admin in the
// mock seed (see src/mocks/handlers/auth.ts and src/mocks/db/seed.ts). They are
// duplicated as literals on purpose — importing from src/mocks here would pull
// the MSW module graph into production bundles, which the `import.meta.env.DEV`
// gate in main.tsx otherwise keeps out.
const MOCK_DEMO_EMAIL = 'admin@example.com';
const MOCK_DEMO_PASSWORD = 'demo1234';

type FieldErrors = Partial<Record<'email' | 'password', string>>;

function mapError(err: unknown): { form: string; fields: FieldErrors } {
  if (err instanceof ApiError) {
    if (err.code === 'invalid_credentials') {
      return {
        form: 'Invalid email or password.',
        fields: { email: 'Check your email address.', password: 'Check your password.' },
      };
    }
    if (err.code === 'unreachable') {
      return {
        form: "Can't reach the server. Check that it's running and reachable from this browser.",
        fields: {},
      };
    }
    const fields: FieldErrors = {};
    err.details?.forEach((d) => {
      if (d.field === 'email' || d.field === 'password') fields[d.field] = d.message;
    });
    return { form: err.message, fields };
  }
  // Network/transport failures surface as non-ApiError rejects from fetch.
  return {
    form: "Can't reach the server. Check your connection and that the server is running.",
    fields: {},
  };
}

export default function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  // RequireAuth forwards the route the user was trying to reach; return there
  // after a successful sign-in (falls back to the dashboard). ChangePasswordPage
  // also passes a passwordChanged flag so we can confirm the rotation.
  const state = location.state as {
    from?: { pathname?: string };
    passwordChanged?: boolean;
  } | null;
  const from = state?.from?.pathname ?? '/';
  const passwordChanged = state?.passwordChanged === true;
  const status = useInstanceStatus();
  // While MSW serves the seeded demo dataset there are no real credentials to
  // type, so the form starts on the demo admin account. With mocks off (every
  // real deployment) both fields stay empty and behave as before.
  const [email, setEmail] = useState(env.mocksEnabled ? MOCK_DEMO_EMAIL : '');
  const [password, setPassword] = useState(env.mocksEnabled ? MOCK_DEMO_PASSWORD : '');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  function clearErrors() {
    setFormError(null);
    setFieldErrors({});
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const fe: FieldErrors = {};
    if (!email.trim()) fe.email = 'Email is required.';
    if (!password) fe.password = 'Password is required.';
    setFormError(null);
    setFieldErrors(fe);
    if (fe.email || fe.password) return;

    setSubmitting(true);
    login(email, password)
      .then(() => navigate(from, { replace: true }))
      .catch((err: unknown) => {
        const mapped = mapError(err);
        setFormError(mapped.form);
        setFieldErrors(mapped.fields);
      })
      .finally(() => setSubmitting(false));
  }

  // Sign-in is the one surface where the brand leads the page rather than
  // labelling it, so the mark runs at hero size above the wordmark instead of
  // in the 32px side-by-side form the shell's rail uses. The plate carries its
  // own contrast, which keeps the lockup independent of the page background.
  //
  // The wordmark is deliberately stepped below the h1 instead of inheriting the
  // lockup's 26px hero step: the mark is what carries the brand at this size,
  // and a 26px name sitting directly above a 26px "Welcome back" read as two
  // competing titles with no hierarchy between them. At text-19 the name reads
  // as the imprint on the letterhead and the page keeps one display line.
  const wordmark = (
    <BrandLockup size={64} tile orientation="stacked" wordmarkClassName="text-19" />
  );

  if (status.state === 'loading') {
    return (
      <div className={SHELL}>
        <div className="flex flex-col items-center gap-3 text-ink-faint">
          <Spinner />
          <span className="text-sm">Connecting to your server…</span>
        </div>
      </div>
    );
  }

  if (status.state === 'unreachable') {
    return (
      <div className={SHELL}>
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl border border-ink/10 bg-white text-ink-faint">
            <ServerIcon className="size-6" />
          </div>
          <h1 className="font-display text-22 font-semibold tracking-tight text-ink">
            Can't reach your server
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            Custotal couldn't connect. Check that the server is running and that this browser can
            reach it.
          </p>
          <p className="mt-3 font-mono text-xs text-ink-faint">{window.location.origin}</p>
          <Button variant="secondary" className="mt-6" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const instance = status.info;

  if (instance.setupRequired) {
    return (
      <div className={SHELL}>
        <div className="w-full max-w-sm text-center">
          {wordmark}
          <h1 className="mt-6 font-display text-22 font-semibold tracking-tight text-ink">
            Finish setting up {instance.orgName}
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
            No administrator account exists yet. Complete the first-run setup to create your
            workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={SHELL}>
      <div className="w-full max-w-sm animate-fade-up">
        {wordmark}

        <div className="mt-7 text-center">
          <h1 className="font-display text-26 font-semibold tracking-tight text-ink">
            Welcome back
          </h1>
          {/* The lockup above already names the product, so the supporting line
              states the task rather than repeating the brand. */}
          <p className="mt-2.5 text-15 text-ink-muted">Sign in to your workspace</p>
        </div>

        {passwordChanged ? (
          <p
            role="status"
            className="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success"
          >
            Your password was updated. Sign in with your new password.
          </p>
        ) : null}

        <form
          onSubmit={submit}
          noValidate
          className="mt-7 space-y-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm"
        >
          {formError ? <ErrorBanner message={formError} /> : null}
          <Field label="Email" htmlFor="email" required error={fieldErrors.email}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              invalid={Boolean(fieldErrors.email)}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearErrors();
              }}
            />
          </Field>
          <Field label="Password" htmlFor="password" required error={fieldErrors.password}>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                invalid={Boolean(fieldErrors.password)}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearErrors();
                }}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="tap-target absolute right-2 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-fill hover:text-ink"
              >
                {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
            </div>
          </Field>
          {instance.allowPasswordReset ? (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="cursor-pointer text-sm font-medium text-forest hover:underline"
              >
                Forgot password?
              </button>
            </div>
          ) : null}
          <Button type="submit" disabled={submitting} aria-busy={submitting} className="w-full">
            {submitting ? (
              <>
                <span
                  className="size-4 animate-spin rounded-full border-2 border-paper/40 border-t-paper"
                  aria-hidden
                />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
      </div>
    </div>
  );
}
