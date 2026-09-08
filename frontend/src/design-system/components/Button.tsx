import React from 'react';
import { cn } from '../cn';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3.5 py-1.5 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2.5',
  };

  const variantClasses = {
    primary: 'cx-btn-primary',
    secondary: 'cx-btn-secondary',
    danger: 'cx-btn-danger',
    ghost: 'bg-transparent text-[var(--cx-color-text)] hover:bg-[var(--cx-color-surface-hover)] border border-transparent rounded-[var(--cx-radius-md)]',
    outline: 'bg-transparent text-[var(--cx-color-brand-primary)] border border-[var(--cx-color-brand-primary)] hover:bg-[var(--cx-color-info-bg)] rounded-[var(--cx-radius-md)]',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors select-none',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
};
