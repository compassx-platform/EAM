import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="rounded p-0.5 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
        aria-label="More information"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {show && (
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-max max-w-xs rounded-md bg-gray-900 px-2.5 py-1.5 text-[11px] leading-tight text-white shadow-lg animate-in fade-in zoom-in-95">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 h-2 w-2 rotate-45 bg-gray-900" />
        </div>
      )}
    </div>
  );
};
