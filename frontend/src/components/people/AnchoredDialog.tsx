import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function computeAnchoredDialogStyle(anchorY?: number, estimatedHeight: number = 380) {
  if (anchorY === undefined || anchorY === null) {
    return { top: 120, arrowTop: 40 };
  }

  const padding = 16;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const maxTop = Math.max(padding, viewportHeight - estimatedHeight - padding);

  // Center dialog around anchorY, clamped within viewport bounds
  const rawTop = anchorY - Math.min(60, estimatedHeight * 0.2);
  const clampedTop = Math.max(padding, Math.min(rawTop, maxTop));

  // Caret arrow points exactly to trigger button anchorY
  const rawArrow = anchorY - clampedTop;
  const clampedArrow = Math.max(16, Math.min(rawArrow, estimatedHeight - 24));

  return {
    top: clampedTop,
    arrowTop: clampedArrow,
  };
}

interface AnchoredDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  anchorY?: number;
  widthClass?: string;
  children: React.ReactNode;
}

export const AnchoredDialog: React.FC<AnchoredDialogProps> = ({
  isOpen,
  onClose,
  title,
  anchorY,
  widthClass = 'w-[380px]',
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { top, arrowTop } = computeAnchoredDialogStyle(anchorY, 400);

  // Outside click dismissal & Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      style={{ top: `${top}px` }}
      className={`fixed right-[340px] z-50 ${widthClass} rounded-xl border border-gray-200 bg-white shadow-2xl transition-all duration-150 animate-in fade-in zoom-in-95`}
    >
      {/* Pointer Notch pointing toward the inspector trigger button */}
      <div
        style={{ top: `${arrowTop}px` }}
        className="pointer-events-none absolute -right-[7px] h-3.5 w-3.5 rotate-45 border-r border-t border-gray-200 bg-white shadow-xs"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
          {title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body with live controls */}
      <div className="max-h-[calc(100vh-180px)] overflow-y-auto p-4 space-y-4">
        {children}
      </div>
    </div>
  );
};
