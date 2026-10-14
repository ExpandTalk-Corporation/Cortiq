/*
 * Retired. This legacy script read browser signals before consent, which
 * ePrivacy Art. 5(3) / LEK 9 kap. 28 § does not allow. It is kept as a no-op so
 * old embeds do not 404.
 *
 * Measure AI crawlers server-side instead (no device access, no banner needed in
 * our assessment): public/cortiq-server.mjs, public/cloudflare-worker.js or the
 * WordPress plugin. Browser analytics: cortiq.js, which waits for consent.
 */
