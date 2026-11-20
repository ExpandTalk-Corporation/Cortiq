import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Site } from '@/types/dashboard';
import { DISCLAIMER } from '@/lib/jurisdiction';

// Spec 2026-11-18 phase 3, decided 2026-11-20: the customer's own Off is applied now; opt-in and the market
// rules are stored and logged only (shadow) until enforcement is switched on.
export const NOT_YET_APPLIED = '"Off" is applied now: it stops data for that purpose on this site. "Require opt-in" and the market rules are recorded only, not yet applied: CortIQ is checking them against real traffic before it starts stopping data, and until then that data is collected as before. None of these rules has been legally reviewed and approved yet; each is a working hypothesis.';
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
          <CardDescription>Your answers select the market rules CortIQ will use once rules are switched on. "Don't know" uses the stricter rule.</CardDescription>
        </CardHeader>
        <CardContent><LegalProfileForm profile={j.data?.profile ?? null} onSave={(a) => j.saveProfile.mutate(a)} saving={j.saveProfile.isPending} /></CardContent>
      </Card>
      <Alert><AlertDescription>{NOT_YET_APPLIED}</AlertDescription></Alert>
      <Card>
        <CardHeader>
          <CardTitle>Make it stricter</CardTitle>
          <CardDescription>You can require opt-in or turn a purpose off. Relaxing a market rule will need your own documented assessment; that option is not available yet.</CardDescription>
        </CardHeader>
        <CardContent><TightenControls tighten={j.data?.tighten ?? {}} onChange={(purpose, outcome) => j.setTighten.mutate({ purpose, outcome })} /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>What the rules would decide</CardTitle>
          <CardDescription>Per market, before any visitor consent. Market rules and opt-in are recorded only, not yet applied; your own Off is applied now. "Baseline" is CortIQ's default when no approved rule exists: opt-in.</CardDescription>
        </CardHeader>
        <CardContent><EffectiveRulesTable customer={j.data?.customer ?? null} tighten={j.data?.tighten ?? {}} /></CardContent>
      </Card>
    </div>
  );
}
