// src/components/dashboard/nav/DashboardBrand.tsx
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DashboardBrand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
      <span className={cn('text-lg font-bold tracking-tight text-gradient-primary', compact && 'sr-only')}>CortIQ</span>
    </div>
  );
}
