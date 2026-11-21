// supabase/functions/_shared/jurisdiction/markets.ts
import type { Market } from './types.ts';

export const EEA_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO',
]);
// Used when geo is unknown and the customer has no profile.
export const STRICTEST_DEFAULT: readonly Market[] = ['eu', 'uk', 'ca_qc'];

export function marketOf(country: unknown, region: unknown): Market | null {
  const c = typeof country === 'string' ? country.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(c) || c === 'XX' || c === 'T1') return null;
  const r = typeof region === 'string' ? region.trim().toUpperCase() : '';
  if (EEA_COUNTRIES.has(c)) return 'eu';
  if (c === 'GB') return 'uk';
  if (c === 'CH') return 'ch';
  // Missing sub-national region = the stricter sub-market (Review Focus 2).
  if (c === 'US') return r === '' || r === 'CA' ? 'us_ca' : 'us_other';
  if (c === 'CA') return r === '' || r === 'QC' ? 'ca_qc' : 'ca_other';
  if (c === 'BR') return 'br';
  // Named so rules can be written for them; until then they get the same rules as 'other'.
  if (c === 'MX') return 'mx';
  if (c === 'AR') return 'ar';
  if (c === 'CL') return 'cl';
  if (c === 'CO') return 'co';
  if (c === 'ZA') return 'za';
  return 'other';
}
