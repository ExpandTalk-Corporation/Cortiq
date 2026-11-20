// The banner's languages. Same list as the sites.banner_language CHECK (20261205000001) and
// cookie_consents.banner_lang (20261207000003).
export const BANNER_LANGS: ReadonlySet<string> = new Set(['sv', 'en', 'de', 'fr', 'pt', 'nl', 'nb', 'da', 'fi', 'pl', 'it', 'es', 'is']);
export const bannerLangOf = (v: unknown): string | null => (typeof v === 'string' && BANNER_LANGS.has(v) ? v : null);
