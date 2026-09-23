// Single source of truth for the CortIQ WordPress plugin version.
// One version is shared by the plugin and the tracking script: keep in sync with
// wordpress-plugin/cortiq-analytics.php (Version / CORTIQ_VERSION),
// wordpress-plugin/readme.txt (Stable tag) and public/spa-tracking.js (CORTIQ_VERSION).
// tests/foundation/version-sync.test.mjs fails the build if they drift.
export const PLUGIN_VERSION = '5.4.0';
export const PLUGIN_LAST_UPDATED = '2026-09-23';
