// src/contexts/DashboardFiltersContext.tsx
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type DashboardFilters, parseFilters, writeFilters } from '@/lib/dashboard/filters';

interface Ctx {
  filters: DashboardFilters;
  setFilters: (patch: Partial<DashboardFilters>) => void;
  dateRange: { from: Date; to: Date };
}
const DashboardFiltersContext = createContext<Ctx | null>(null);

export function DashboardFiltersProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params, new Date()), [params]);
  const setFilters = useCallback((patch: Partial<DashboardFilters>) => {
    setParams((prev) => writeFilters(prev, { ...parseFilters(prev, new Date()), ...patch }), { replace: true });
  }, [setParams]);
  const dateRange = useMemo(() => ({
    from: new Date(`${filters.from}T00:00:00`),
    to: new Date(`${filters.to}T23:59:59`),
  }), [filters.from, filters.to]);
  return (
    <DashboardFiltersContext.Provider value={{ filters, setFilters, dateRange }}>
      {children}
    </DashboardFiltersContext.Provider>
  );
}

export function useDashboardFilters(): Ctx {
  const ctx = useContext(DashboardFiltersContext);
  if (!ctx) throw new Error('useDashboardFilters must be used inside DashboardFiltersProvider');
  return ctx;
}
