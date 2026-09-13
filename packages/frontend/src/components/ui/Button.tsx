import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

const variantCls: Record<Variant, string> = {
  primary: 'bg-forest text-paper hover:bg-forest-dark active:bg-forest-dark',
  secondary: 'bg-cream text-ink border border-ink/15 hover:bg-fill active:bg-fill-strong',
  ghost: 'text-ink-muted hover:text-ink hover:bg-fill active:bg-fill-strong',
  danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/90',
  subtle: 'text-forest hover:bg-forest/10 active:bg-forest/15',
};

const sizeCls: Record<Size, string> = {
  sm: 'text-13 px-2.5 py-1.5',
  md: 'text-sm px-4 py-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        sizeCls[size],
        variantCls[variant],
        className,
      )}
      {...props}
    />
  );
}
