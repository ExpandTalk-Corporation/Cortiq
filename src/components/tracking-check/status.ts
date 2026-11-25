import { AlertTriangle, CheckCircle2, Hand, HelpCircle, XCircle } from 'lucide-react';
import type { ConsentCategory, FindingStatus } from '../../../supabase/functions/_shared/tracking-check/types.ts';

export const STATUS: Record<FindingStatus, { label: string; icon: typeof XCircle; className: string }> = {
  fail: { label: 'Problem', icon: XCircle, className: 'text-red-600 dark:text-red-400' },
  warning: { label: 'Review', icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400' },
  manual: { label: 'Test manually', icon: Hand, className: 'text-blue-600 dark:text-blue-400' },
  untestable: { label: 'Not tested', icon: HelpCircle, className: 'text-muted-foreground' },
  pass: { label: 'OK', icon: CheckCircle2, className: 'text-green-600 dark:text-green-400' },
};

/** One colour per consent category, kept clear of the red/amber/green status colours. */
export const CATEGORY_STYLE: Record<ConsentCategory, { label: string; dot: string; badge: string }> = {
  necessary: { label: 'Necessary', dot: 'bg-slate-400', badge: 'border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300' },
  analytics: { label: 'Statistics', dot: 'bg-sky-500', badge: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  marketing: { label: 'Marketing', dot: 'bg-violet-500', badge: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  preferences: { label: 'Preferences', dot: 'bg-teal-500', badge: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300' },
};
export const CATEGORY_ORDER: ConsentCategory[] = ['marketing', 'analytics', 'preferences', 'necessary'];
