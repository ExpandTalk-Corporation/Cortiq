import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Site } from '@/types/dashboard';
import { DISCLAIMER } from '@/lib/jurisdiction';

// Shadow mode (spec 2026-11-18 phase 3): settings are stored and logged, nothing is stopped yet.
export const NOT_YET_APPLIED = 'Recorded, not yet applied: CortIQ is checking these rules against real traffic before it starts stopping data. Until then, data for every purpose is collected as before.';
import { useSiteJurisdiction } from '@/hooks/useSiteJurisdiction';
import { LegalProfileForm } from './LegalProfileForm';
import { TightenControls } from './TightenControls';
import { EffectiveRulesTable } from './EffectiveRulesTable';

export function RulesByMarketTab({ selectedSite }: { selectedSite: Site | null }) {
  const j = useSiteJurisdiction(selectedSite?.id);
  if (!selectedSite) return null;
  return (
    <div className="space-y-6">
      <Alert><AlertDescription>{DISCLAIMER}</AlertDescription></Alert>
      <Card>
        <CardHeader>
          <CardTitle>Where you operate</CardTitle>
          <CardDescription>Answers decide which market rules CortIQ applies. "Don't know" uses the stricter rule.</CardDescription>
        </CardHeader>
        <CardContent><LegalProfileForm profile={j.data?.profile ?? null} onSave={(a) => j.saveProfile.mutate(a)} saving={j.saveProfile.isPending} /></CardContent>
      </Card>
      <Alert><AlertDescription>{NOT_YET_APPLIED}</AlertDescription></Alert>
      <Card>
        <CardHeader>
          <CardTitle>Make it stricter</CardTitle>
          <CardDescription>You can require opt-in or turn a purpose off. Relaxing a market rule needs an exception approved by CortIQ; none are available yet.</CardDescription>
        </CardHeader>
        <CardContent><TightenControls tighten={j.data?.tighten ?? {}} onChange={(purpose, outcome) => j.setTighten.mutate({ purpose, outcome })} /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>What applies now</CardTitle>
          <CardDescription>Per market, before any visitor consent. "Baseline" means opt-in is required.</CardDescription>
        </CardHeader>
        <CardContent><EffectiveRulesTable customer={j.data?.customer ?? null} tighten={j.data?.tighten ?? {}} /></CardContent>
      </Card>
    </div>
  );
}
