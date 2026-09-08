import React from 'react';
import { cn } from '../cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  interactive = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-md)] p-5 shadow-[var(--cx-shadow-1)]',
        interactive && 'cursor-pointer hover:border-[var(--cx-color-brand-primary)] hover:shadow-[var(--cx-shadow-2)] transition-all',
        className
      )}
    >
      {children}
    </div>
  );
};
