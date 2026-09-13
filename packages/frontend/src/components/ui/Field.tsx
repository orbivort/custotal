import {
  createContext,
  useContext,
  useId,
  type AriaAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

const controlBase =
  'w-full rounded-md border bg-white px-3 py-2 text-15 text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 transition';
const controlNormal = 'border-ink/15 focus:ring-forest/25 focus:border-forest';
const controlInvalid = 'border-danger/60 focus:ring-danger/20 focus:border-danger';

const controlCls = `${controlBase} ${controlNormal}`;

type FieldA11y = {
  /** IDs of hint/error paragraphs rendered by the surrounding Field. */
  describedBy?: string;
  /** Marks the control as required for assistive technology. */
  required?: AriaAttributes['aria-required'];
};

const FieldA11yContext = createContext<FieldA11y | undefined>(undefined);

/**
 * Merge aria attributes contributed by a surrounding <Field> (hint/error
 * description, required flag) with anything the caller passed explicitly.
 * Caller-provided values always win.
 */
function useFieldA11y(props: {
  'aria-describedby'?: string;
  'aria-required'?: AriaAttributes['aria-required'];
}): FieldA11y {
  const ctx = useContext(FieldA11yContext);
  const describedBy = props['aria-describedby'] ?? ctx?.describedBy;
  const required = props['aria-required'] ?? ctx?.required;
  return { describedBy, required };
}

export function Input({
  className,
  invalid = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const a11y = useFieldA11y(props);
  return (
    <input
      aria-invalid={invalid || undefined}
      aria-describedby={a11y.describedBy}
      aria-required={a11y.required}
      className={cn(controlBase, invalid ? controlInvalid : controlNormal, className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid = false,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const a11y = useFieldA11y(props);
  return (
    <textarea
      aria-invalid={invalid || undefined}
      aria-describedby={a11y.describedBy}
      aria-required={a11y.required}
      className={cn(
        controlCls,
        invalid ? controlInvalid : controlNormal,
        'min-h-24 resize-y',
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  invalid = false,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const a11y = useFieldA11y(props);
  return (
    <select
      aria-invalid={invalid || undefined}
      aria-describedby={a11y.describedBy}
      aria-required={a11y.required}
      className={cn(
        controlCls,
        invalid ? controlInvalid : controlNormal,
        'cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint && !error ? hintId : undefined, error ? errorId : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-muted">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <FieldA11yContext.Provider value={{ describedBy: describedBy || undefined, required }}>
        {children}
      </FieldA11yContext.Provider>
      {hint && !error ? (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
