// utm_medium values the CortIQ-side Ads view (paid-ads-analytics) counts as paid.
// click-fraud-analysis accepts these plus paid_search / paidsearch.
export const PAID_MEDIUMS = ['cpc', 'ppc', 'paid-social', 'display', 'paid'] as const;
