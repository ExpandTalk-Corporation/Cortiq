import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Flat-top hexagon, inset 1 unit so the stroke stays inside the box. Same shape as agentflow.se.
const W = 44;
const H = 38.104;
const POINTS = '43,19.05 32.5,37.24 11.5,37.24 1,19.05 11.5,0.87 32.5,0.87';

interface HexIconProps {
  children: ReactNode;
  /** Width in px; the height follows the hexagon's proportions. */
  size?: number;
  /** Sets the colour of both the hexagon and the icon, e.g. text-primary. */
  className?: string;
}

/** Icon on a tinted hexagon: the badge shape for feature cards on the marketing pages. */
export function HexIcon({ children, size = 48, className }: HexIconProps) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center text-primary', className)}
      style={{ width: size, height: (size * H) / W }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <polygon points={POINTS} fill="currentColor" fillOpacity={0.13} stroke="currentColor" strokeOpacity={0.45} strokeWidth={1.2} />
      </svg>
      <span className="relative flex items-center justify-center">{children}</span>
    </span>
  );
}
