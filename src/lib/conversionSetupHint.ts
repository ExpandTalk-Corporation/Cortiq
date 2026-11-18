// Why a site with real form activity has no conversions (spec 2026-11-18 phase 1 AC1):
// either no goals at all, or only the unedited templates, whose selectors match no real form.

export const PREDEFINED_GOALS = [
  { name: 'Contact form', type: 'form_submission', selector: 'form[name="contact"], #contact-form, .contact-form', value: 50 },
  { name: 'Phone click', type: 'phone_click', selector: 'a[href^="tel:"], .phone-link, .call-button', value: 25 },
  { name: 'Quote request', type: 'form_submission', selector: 'form[name="quote"], #quote-form, .quote-form', value: 100 },
  { name: 'Newsletter signup', type: 'form_submission', selector: 'form[name="newsletter"], #newsletter, .newsletter-signup', value: 15 },
] as const;

/** Counts every successful form submit on the site. Visitors' input is never read. */
export const ANY_FORM_GOAL = { name: 'Any form submission', type: 'form_submission', selector: 'form', value: 0 } as const;

export type ConversionSetupHint = 'ok' | 'no_goals' | 'template_only';

export function conversionSetupHint(input: { completedForms30d: number; goals: Array<{ type: string; selector: string }> }): ConversionSetupHint {
  if (!(input.completedForms30d > 0)) return 'ok';
  if (input.goals.length === 0) return 'no_goals';
  const templates = new Set<string>(PREDEFINED_GOALS.map((g) => g.selector));
  return input.goals.every((g) => templates.has(g.selector)) ? 'template_only' : 'ok';
}
