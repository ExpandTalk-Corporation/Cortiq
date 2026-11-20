import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { profileToCustomer } from '@/lib/jurisdiction';
import type { Purpose } from '@/lib/jurisdiction';

export interface ProfileAnswers { establishment: string | null; markets: string[]; answers: Record<string, 'yes' | 'no' | 'dont_know'> }

export function useSiteJurisdiction(siteId: string | undefined) {
  const qc = useQueryClient();
  const key = ['site-jurisdiction', siteId];
  const query = useQuery({
    queryKey: key, enabled: !!siteId,
    queryFn: async () => {
      const [{ data: profile, error: pe }, { data: overrides, error: oe }] = await Promise.all([
        supabase.from('site_legal_profiles').select('establishment_country, markets, answers').eq('site_id', siteId!).maybeSingle(),
        supabase.from('site_jurisdiction_tighten').select('purpose, setting').eq('site_id', siteId!),
      ]);
      if (pe) throw pe;
      if (oe) throw oe;
      const tighten: Partial<Record<Purpose, string>> = {};
      for (const o of overrides ?? []) tighten[o.purpose as Purpose] = o.setting;
      return { profile, customer: profileToCustomer(profile), tighten };
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });
  const saveProfile = useMutation({
    mutationFn: async (a: ProfileAnswers) => {
      const { error } = await supabase.rpc('save_site_legal_profile', { p_site_id: siteId!, p_establishment: a.establishment, p_markets: a.markets, p_answers: a.answers });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Saved');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  const setTighten = useMutation({
    mutationFn: async ({ purpose, outcome }: { purpose: Purpose; outcome: 'opt_in' | 'off' | null }) => {
      const q = supabase.from('site_jurisdiction_tighten');
      const { error } = outcome === null
        ? await q.delete().eq('site_id', siteId!).eq('purpose', purpose)
        : await q.upsert({ site_id: siteId!, purpose, setting: outcome }, { onConflict: 'site_id,purpose' });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Saved');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  return { ...query, saveProfile, setTighten };
}
