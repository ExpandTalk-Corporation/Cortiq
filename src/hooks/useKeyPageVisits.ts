// src/hooks/useKeyPageVisits.ts
// Visits to contact, cart, checkout and confirmation pages, recognised by path, so the
// overview shows purchase and contact intent even when no conversion goals are set up.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type KeyPageCategory = 'contact' | 'cart' | 'checkout' | 'confirmation';
export type KeyPageRow = { category: KeyPageCategory; path: string; views: number; visits: number };
export type KeyPageSummary = { category: KeyPageCategory; visits: number; views: number; paths: KeyPageRow[] };

export const KEY_PAGE_LABELS: Record<KeyPageCategory, string> = {
  contact: 'Contact pages',
  cart: 'Cart',
  checkout: 'Checkout',
  confirmation: 'Order / thank-you',
};
const ORDER: KeyPageCategory[] = ['contact', 'cart', 'checkout', 'confirmation'];

/** Rows per path → one summary per category, in funnel order. Visits are summed per path, so a
 *  visit that saw two contact pages counts twice; good enough for an at-a-glance figure. */
export function summariseKeyPages(rows: KeyPageRow[]): KeyPageSummary[] {
  return ORDER.map((category) => {
    const paths = rows.filter((r) => r.category === category);
    return {
      category,
      paths,
      visits: paths.reduce((s, r) => s + r.visits, 0),
      views: paths.reduce((s, r) => s + r.views, 0),
    };
  }).filter((s) => s.paths.length > 0);
}

export function useKeyPageVisits(siteId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['key-page-visits', siteId, from, to],
    enabled: !!siteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // RPC is newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any).rpc('get_key_page_visits', { p_site_id: siteId, p_from: from, p_to: to });
      if (error) throw error;
      const rows = ((data ?? []) as { category: KeyPageCategory; path: string; views: number | string; visits: number | string }[])
        .map((r) => ({ category: r.category, path: r.path, views: Number(r.views), visits: Number(r.visits) }));
      return summariseKeyPages(rows);
    },
  });
}
