import React from 'react';
import { cn } from '../cn';
import { getStatusStyle } from '../tokens';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'status' | 'default' | 'primary' | 'success' | 'warning' | 'error' | 'outline';
  status?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  status,
  size = 'md',
  className,
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (variant === 'status' && status) {
    const style = getStatusStyle(status);
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 font-medium rounded-full border',
          sizeClasses,
          className
        )}
        style={{
          backgroundColor: style.bg,
          color: style.text,
          borderColor: style.border,
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: style.text }}
        />
        {children || status}
      </span>
    );
  }

  const variantClasses = {
    default: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
    primary: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    success: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    warning: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    error: 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    outline: 'bg-transparent text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border',
        sizeClasses,
        variantClasses[variant] || variantClasses.default,
        className
      )}
    >
      {children}
    </span>
  );
};
