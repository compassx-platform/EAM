import React from 'react';

interface CompassXLogoProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function CompassXLogo({
  size = 28,
  color = '#2272B4',
  className,
  style,
}: CompassXLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ flexShrink: 0, display: 'block', ...style }}
    >
      <path
        d="M 58.1 14.9 A 36 36 0 0 1 85.1 41.9"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M 85.1 58.1 A 36 36 0 0 1 58.1 85.1"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M 41.9 85.1 A 36 36 0 0 1 14.9 58.1"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M 14.9 41.9 A 36 36 0 0 1 41.9 14.9"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <polygon points="68,32 56.5,56.5 43.5,43.5" fill={color} />
      <polygon
        points="68,32 56.5,56.5 32,68 43.5,43.5"
        fill="none"
        stroke={color}
        strokeWidth="3.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line
        x1="43.5"
        y1="43.5"
        x2="56.5"
        y2="56.5"
        stroke={color}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default CompassXLogo;
