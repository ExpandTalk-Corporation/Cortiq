import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MARKETS, PROFILE_QUESTIONS } from '@/lib/jurisdiction';
import type { Answer, Market } from '@/lib/jurisdiction';
import type { ProfileAnswers } from '@/hooks/useSiteJurisdiction';

export interface LegalProfileFormProps {
  // `answers` comes back from Supabase as Json; narrowed defensively below.
  profile: { establishment_country: string | null; markets: string[]; answers: unknown } | null;
  onSave: (a: ProfileAnswers) => void;
  saving: boolean;
}

const MARKET_LABEL: Record<Market, string> = {
  eu: 'EU / EEA', uk: 'UK', ch: 'Switzerland', us_ca: 'US — California', us_other: 'US — other states',
  ca_qc: 'Canada — Québec', ca_other: 'Canada — other provinces', br: 'Brazil',
  mx: 'Mexico', ar: 'Argentina', cl: 'Chile', co: 'Colombia', za: 'South Africa', other: 'Other',
};

export function LegalProfileForm({ profile, onSave, saving }: LegalProfileFormProps) {
  const [establishment, setEstablishment] = useState('');
  const [markets, setMarkets] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  // Resync from the profile prop (e.g. on site switch).
  useEffect(() => {
    setEstablishment(profile?.establishment_country ?? '');
    setMarkets(profile?.markets ?? []);
    const rawAnswers = (profile?.answers && typeof profile.answers === 'object' && !Array.isArray(profile.answers))
      ? (profile.answers as Record<string, unknown>) : {};
    const next: Record<string, Answer> = {};
    for (const q of PROFILE_QUESTIONS) {
      const a = rawAnswers[q.key];
      if (a === 'yes' || a === 'no' || a === 'dont_know') next[q.key] = a;
    }
    setAnswers(next);
  }, [profile]);

  const toggleMarket = (m: Market, checked: boolean) => {
    setMarkets((prev) => (checked ? [...new Set([...prev, m])] : prev.filter((x) => x !== m)));
  };

  const establishmentValid = establishment === '' || /^[A-Z]{2}$/.test(establishment);

  const submit = () => {
    const est = establishment.trim();
    onSave({ establishment: est ? est.toUpperCase() : null, markets, answers });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label htmlFor="establishment-country">Establishment country (ISO 3166-1 alpha-2, e.g. SE)</Label>
        <Input
          id="establishment-country"
          value={establishment}
          maxLength={2}
          placeholder="SE"
          onChange={(e) => setEstablishment(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
        />
        {!establishmentValid && (
          <p className="text-sm text-destructive">Enter a 2-letter country code (e.g. SE), or leave it empty.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Markets you serve</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {MARKETS.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <Checkbox
                id={`market-${m}`}
                checked={markets.includes(m)}
                onCheckedChange={(checked) => toggleMarket(m, checked === true)}
              />
              <Label htmlFor={`market-${m}`} className="font-normal">{MARKET_LABEL[m]}</Label>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">Visitors whose country we cannot verify are treated by the strictest of the markets you select.</p>
      </div>

      {PROFILE_QUESTIONS.map((q) => (
        <div key={q.key} className="space-y-1">
          <Label>{q.text}</Label>
          <p className="text-sm text-muted-foreground">{q.help}</p>
          <RadioGroup
            value={answers[q.key] ?? ''}
            onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.key]: v as Answer }))}
            className="flex flex-row gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id={`${q.key}-yes`} value="yes" />
              <Label htmlFor={`${q.key}-yes`} className="font-normal">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id={`${q.key}-no`} value="no" />
              <Label htmlFor={`${q.key}-no`} className="font-normal">No</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id={`${q.key}-dont_know`} value="dont_know" />
              <Label htmlFor={`${q.key}-dont_know`} className="font-normal">I don't know</Label>
            </div>
          </RadioGroup>
        </div>
      ))}

      <Button onClick={submit} disabled={saving || !establishmentValid}>{saving ? 'Saving...' : 'Save'}</Button>
    </div>
  );
}
