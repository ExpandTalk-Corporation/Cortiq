<?php
/**
 * Plugin Name: CortIQ Analytics
 * Plugin URI: https://cortiq.se
 * Description: Analytics for the agentic web. Track AI agents (ChatGPT Browser, Perplexity, Claude, Gemini) and human visitors — cookie-free, GDPR-compliant, with heatmaps, session recording and A/B testing.
 * Version: 5.4.0
 * Author: CortIQ
 * Author URI: https://cortiq.se
 * Requires at least: 5.6
 * Tested up to: 6.8
 * Requires PHP: 7.4
 * License: GPL v2 or later
 * Text Domain: cortiq
 */

// Block direct access
if ( ! defined( 'ABSPATH' ) ) exit;

// Prevent double-loading
if ( defined( 'CORTIQ_LOADED' ) ) return;
define( 'CORTIQ_LOADED', true );

// Shared with public/spa-tracking.js (CORTIQ_VERSION) — also the ?ver= cache-bust for it.
define( 'CORTIQ_VERSION',    '5.4.0' );
define( 'CORTIQ_OPTION_KEY', 'cortiq_options' );
define( 'CORTIQ_CDN',        'https://cortiq.se' );
// Supabase Edge Functions base — used for the GDPR consent ledger (store-consent).
define( 'CORTIQ_API',        'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1' );

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cortiq_defaults() {
    return array(
        'site_id'               => '',   // UUID from CortIQ dashboard
        'tracking_id'           => '',   // tk_xxx (legacy, kept for reference)
        'ga4_id'                => '',   // Google Analytics 4 Measurement ID (G-XXXXXXXXXX)
        'tracking_enabled'      => true,
        'gdpr_enabled'          => true,
        'anonymize_ip'          => true,
        'excluded_roles'        => array( 'administrator' ),
        'accent_color'          => '#6366f1',
        'tracking_mode'         => 'full',   // 'cookieless' (no fingerprint/profile) | 'full'
        'banner_language'       => 'auto',   // 'auto' (WP locale) | 'en' | 'sv' | 'de'
        'consent_mode'          => 'basic',  // GA4 Consent Mode: 'basic' | 'advanced'
        'policy_version'        => '1',      // change to re-prompt every visitor
        'reprompt_cooldown_days'=> 365,      // how long a saved choice is respected before re-asking
        'consent_region'        => 'eea',    // 'eea' (region-scoped defaults) | 'global'
        'geo_gating'            => false,    // show the banner only to EEA/UK/CH visitors
    );
}

function cortiq_options() {
    $saved = get_option( CORTIQ_OPTION_KEY, array() );

    // Migrate legacy key from class-based plugin versions (< 5.1)
    if ( empty( $saved['ga4_id'] ) && ! empty( $saved['ga_measurement_id'] ) ) {
        $saved['ga4_id'] = $saved['ga_measurement_id'];
    }

    return wp_parse_args( $saved, cortiq_defaults() );
}

// ─────────────────────────────────────────────────────────────────────────────
// i18n — banner strings (flat dictionary; add a language = add a key)
// ─────────────────────────────────────────────────────────────────────────────

function cortiq_banner_lang( $opts ) {
    $choice = isset( $opts['banner_language'] ) ? $opts['banner_language'] : 'auto';
    if ( 'auto' === $choice ) {
        $loc = strtolower( (string) get_locale() );
        if ( 0 === strpos( $loc, 'sv' ) ) return 'sv';
        if ( 0 === strpos( $loc, 'de' ) ) return 'de';
        if ( 0 === strpos( $loc, 'fr' ) ) return 'fr';
        if ( 0 === strpos( $loc, 'pt' ) ) return 'pt';
        return 'en';
    }
    return in_array( $choice, array( 'en', 'sv', 'de', 'fr', 'pt' ), true ) ? $choice : 'en';
}

function cortiq_banner_strings( $lang ) {
    $s = array(
        'en' => array(
            'title'          => '🍪 Cookie settings',
            'intro'          => 'We want to understand what readers enjoy, and show you relevant content. Choose what you allow.',
            'necessary'      => 'Necessary',
            'necessary_desc' => 'Required for the site to work. Always on.',
            'preferences'    => 'Preferences',
            'preferences_desc' => 'Remembers choices like language and layout.',
            'statistics'     => 'Statistics',
            'statistics_desc' => 'Helps us see which pages and content people like.',
            'marketing'      => 'Marketing',
            'marketing_desc' => 'Used to show relevant ads and measure campaigns.',
            'show_details'   => 'Show details',
            'hide_details'   => 'Hide details',
            'accept_all'     => 'Accept all',
            'only_necessary' => 'Only necessary',
            'save'           => 'Save selection',
            'reopen'         => 'Cookie settings',
            'consent_date'   => 'Consent date',
            'consent_id'     => 'Consent ID',
            'categories'     => 'Categories',
            'close'          => 'Close',
        ),
        'sv' => array(
            'title'          => '🍪 Cookie-inställningar',
            'intro'          => 'Vi vill förstå vad läsarna gillar och visa dig relevant innehåll. Välj vad du tillåter.',
            'necessary'      => 'Nödvändiga',
            'necessary_desc' => 'Krävs för att sajten ska fungera. Alltid på.',
            'preferences'    => 'Preferenser',
            'preferences_desc' => 'Kommer ihåg val som språk och layout.',
            'statistics'     => 'Statistik',
            'statistics_desc' => 'Hjälper oss se vilka sidor och innehåll besökarna gillar.',
            'marketing'      => 'Marknadsföring',
            'marketing_desc' => 'Används för att visa relevanta annonser och mäta kampanjer.',
            'show_details'   => 'Visa detaljer',
            'hide_details'   => 'Dölj detaljer',
            'accept_all'     => 'Acceptera alla',
            'only_necessary' => 'Endast nödvändiga',
            'save'           => 'Spara val',
            'reopen'         => 'Cookie-inställningar',
            'consent_date'   => 'Samtyckesdatum',
            'consent_id'     => 'Samtyckes-ID',
            'categories'     => 'Kategorier',
            'close'          => 'Stäng',
        ),
        'de' => array(
            'title'          => '🍪 Cookie-Einstellungen',
            'intro'          => 'Wir möchten verstehen, was Leser mögen, und Ihnen relevante Inhalte zeigen. Wählen Sie, was Sie erlauben.',
            'necessary'      => 'Notwendig',
            'necessary_desc' => 'Für den Betrieb der Website erforderlich. Immer aktiv.',
            'preferences'    => 'Präferenzen',
            'preferences_desc' => 'Merkt sich Einstellungen wie Sprache und Layout.',
            'statistics'     => 'Statistik',
            'statistics_desc' => 'Hilft uns zu sehen, welche Seiten und Inhalte gefallen.',
            'marketing'      => 'Marketing',
            'marketing_desc' => 'Für relevante Werbung und die Messung von Kampagnen.',
            'show_details'   => 'Details anzeigen',
            'hide_details'   => 'Details ausblenden',
            'accept_all'     => 'Alle akzeptieren',
            'only_necessary' => 'Nur notwendige',
            'save'           => 'Auswahl speichern',
            'reopen'         => 'Cookie-Einstellungen',
            'consent_date'   => 'Einwilligungsdatum',
            'consent_id'     => 'Einwilligungs-ID',
            'categories'     => 'Kategorien',
            'close'          => 'Schließen',
        ),
        'fr' => array(
            'title'          => '🍪 Paramètres des cookies',
            'intro'          => 'Nous voulons comprendre ce que les lecteurs apprécient et vous proposer un contenu pertinent. Choisissez ce que vous autorisez.',
            'necessary'      => 'Nécessaires',
            'necessary_desc' => 'Requis au fonctionnement du site. Toujours actifs.',
            'preferences'    => 'Préférences',
            'preferences_desc' => 'Mémorise vos choix comme la langue et la mise en page.',
            'statistics'     => 'Statistiques',
            'statistics_desc' => 'Nous aide à voir quelles pages et quels contenus plaisent.',
            'marketing'      => 'Marketing',
            'marketing_desc' => 'Utilisé pour afficher des publicités pertinentes et mesurer les campagnes.',
            'show_details'   => 'Afficher les détails',
            'hide_details'   => 'Masquer les détails',
            'accept_all'     => 'Tout accepter',
            'only_necessary' => 'Nécessaires uniquement',
            'save'           => 'Enregistrer la sélection',
            'reopen'         => 'Paramètres des cookies',
            'consent_date'   => 'Date du consentement',
            'consent_id'     => 'ID de consentement',
            'categories'     => 'Catégories',
            'close'          => 'Fermer',
        ),
        'pt' => array(
            'title'          => '🍪 Definições de cookies',
            'intro'          => 'Queremos perceber o que os leitores gostam e mostrar-lhe conteúdo relevante. Escolha o que permite.',
            'necessary'      => 'Necessários',
            'necessary_desc' => 'Necessários para o funcionamento do site. Sempre ativos.',
            'preferences'    => 'Preferências',
            'preferences_desc' => 'Memoriza escolhas como idioma e esquema.',
            'statistics'     => 'Estatísticas',
            'statistics_desc' => 'Ajuda-nos a ver que páginas e conteúdos as pessoas preferem.',
            'marketing'      => 'Marketing',
            'marketing_desc' => 'Usado para mostrar anúncios relevantes e medir campanhas.',
            'show_details'   => 'Mostrar detalhes',
            'hide_details'   => 'Ocultar detalhes',
            'accept_all'     => 'Aceitar tudo',
            'only_necessary' => 'Apenas necessários',
            'save'           => 'Guardar seleção',
            'reopen'         => 'Definições de cookies',
            'consent_date'   => 'Data do consentimento',
            'consent_id'     => 'ID de consentimento',
            'categories'     => 'Categorias',
            'close'          => 'Fechar',
        ),
    );
    return isset( $s[ $lang ] ) ? $s[ $lang ] : $s['en'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Activation / Uninstall
// ─────────────────────────────────────────────────────────────────────────────

register_activation_hook( __FILE__, 'cortiq_activate' );
function cortiq_activate() {
    $existing = get_option( CORTIQ_OPTION_KEY, array() );

    // Migrate legacy ga_measurement_id → ga4_id (class-based plugin versions < 5.1)
    if ( empty( $existing['ga4_id'] ) && ! empty( $existing['ga_measurement_id'] ) ) {
        $existing['ga4_id'] = $existing['ga_measurement_id'];
        unset( $existing['ga_measurement_id'] );
    }

    update_option( CORTIQ_OPTION_KEY, wp_parse_args( $existing, cortiq_defaults() ) );
}

register_uninstall_hook( __FILE__, 'cortiq_uninstall' );
function cortiq_uninstall() {
    delete_option( CORTIQ_OPTION_KEY );
}

// ─────────────────────────────────────────────────────────────────────────────
// Frontend: enqueue tracking scripts
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'wp_enqueue_scripts', 'cortiq_enqueue' );
function cortiq_enqueue() {
    $opts = cortiq_options();

    if ( empty( $opts['tracking_enabled'] ) ) return;
    if ( empty( $opts['site_id'] ) ) return;

    // Skip excluded roles
    if ( is_user_logged_in() ) {
        $user  = wp_get_current_user();
        $roles = (array) $opts['excluded_roles'];
        if ( array_intersect( $roles, (array) $user->roles ) ) return;
    }

    // spa-tracking.js is the unified script:
    // Heatmaps · Sessions · AI Agent Detection · Bot Tracking · Citations · UTM/Paid Ads
    wp_enqueue_script(
        'cortiq-tracking',
        CORTIQ_CDN . '/spa-tracking.js',
        array(),
        CORTIQ_VERSION,
        false // load in <head>, defer added via filter below
    );

    // spa-tracking.js reads window.cortiqConfig (NOT data-* attributes) — inject it
    // BEFORE the script tag so siteId/apiKey are available when the script runs.
    // siteId/apiKey are the CortIQ account credentials; the visited site is resolved
    // server-side by domain, so one account key serves all of the account's sites.
    $config = wp_json_encode( array(
        'apiUrl'      => CORTIQ_API,
        'siteId'      => $opts['site_id'],
        'apiKey'      => $opts['tracking_id'],
        'contentType' => 'page',
        'platform'    => 'web',
        // Cookieless mode: no fingerprint and no cross-visit profile. It still
        // requires analytics consent — only the bot/security layer runs without it.
        'cookieless'  => ( 'cookieless' === $opts['tracking_mode'] ),
    ) );
    wp_add_inline_script( 'cortiq-tracking', 'window.cortiqConfig = ' . $config . ';', 'before' );

    add_filter( 'script_loader_tag', 'cortiq_add_script_attrs', 10, 2 );
}

function cortiq_add_script_attrs( $tag, $handle ) {
    if ( 'cortiq-tracking' !== $handle ) return $tag;
    // Config travels via window.cortiqConfig (injected above); just defer the load.
    return str_replace( ' src=', ' defer src=', $tag );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookie consent banner
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'wp_footer', 'cortiq_cookie_banner', 100 );
function cortiq_cookie_banner() {
    $opts = cortiq_options();
    if ( empty( $opts['gdpr_enabled'] ) ) return;
    $accent = $opts['accent_color'] ? esc_attr( $opts['accent_color'] ) : '#6366f1';
    $t      = cortiq_banner_strings( cortiq_banner_lang( $opts ) );
    ?>
<style>
#cq-overlay,#cq-reopen{--cq-accent:<?php echo $accent; ?>}
#cq-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99998;align-items:flex-end;justify-content:center;padding:0}
#cq-box{background:#1e1e2e;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;width:100%;max-width:640px;border-radius:12px 12px 0 0;border-top:1px solid var(--cq-accent);box-shadow:0 -8px 40px rgba(0,0,0,.5);max-height:90vh;overflow-y:auto;position:relative}
.cq-close{position:absolute;top:8px;right:10px;background:none;border:none;color:#94a3b8;font-size:22px;line-height:1;cursor:pointer;padding:4px 9px;font-family:inherit;z-index:1;border-radius:6px}
.cq-close:hover{color:#e2e8f0;background:#2d2d45}
#cq-box h2{margin:0;font-size:16px;font-weight:700;color:#e2e8f0;padding-right:28px}
#cq-box p{margin:8px 0 0;font-size:13px;color:#94a3b8;line-height:1.5}
.cq-head{padding:20px 20px 12px}
.cq-cats{padding:0 20px}
.cq-cat{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-top:1px solid #2d2d45}
.cq-cat-info{flex:1}
.cq-cat-name{font-weight:600;font-size:13px;color:#e2e8f0}
.cq-cat-desc{font-size:12px;color:#64748b;margin-top:2px}
.cq-toggle{position:relative;width:40px;height:22px;flex-shrink:0;margin-top:1px}
.cq-toggle input{opacity:0;width:0;height:0;position:absolute}
.cq-slider{position:absolute;inset:0;border-radius:22px;background:#374151;cursor:pointer;transition:.2s}
.cq-slider:before{content:'';position:absolute;width:16px;height:16px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.2s}
.cq-toggle input:checked+.cq-slider{background:var(--cq-accent)}
.cq-toggle input:checked+.cq-slider:before{transform:translateX(18px)}
.cq-toggle input:disabled+.cq-slider{opacity:.5;cursor:not-allowed}
.cq-details-toggle{display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--cq-accent);font-size:12px;cursor:pointer;padding:10px 20px 4px;font-family:inherit}
.cq-details{display:none;margin:0 20px 12px;padding:12px;background:#161625;border-radius:8px;font-size:12px;color:#64748b;border:1px solid #2d2d45}
.cq-details dt{color:#94a3b8;font-weight:600;margin-top:8px}
.cq-details dt:first-child{margin-top:0}
.cq-details dd{margin:2px 0 0;word-break:break-all;color:#6b7280}
.cq-btns{display:flex;flex-wrap:wrap;gap:8px;padding:16px 20px 20px;border-top:1px solid #2d2d45}
.cq-btn{flex:1;min-width:120px;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:inherit}
.cq-btn-primary{background:var(--cq-accent);color:#fff}
.cq-btn-primary:hover{filter:brightness(.92)}
.cq-btn-secondary{background:#1e293b;color:#94a3b8;border:1px solid #374151}
.cq-btn-secondary:hover{color:#e2e8f0;border-color:var(--cq-accent)}
#cq-reopen{display:none;position:fixed;bottom:20px;left:20px;z-index:99997;width:26px;height:26px;border-radius:50%;border:none;background:var(--cq-accent);color:#fff;cursor:pointer;font-size:16px;line-height:26px;text-align:center;padding:0;box-shadow:0 1px 4px rgba(0,0,0,.3);opacity:.92;font-family:inherit}
#cq-reopen:hover{opacity:1}
/* Minimal-consent state: a hollow pill with a small label — a discreet, STATIC (no
   animation, no red dot) invitation to reconsider. Full consent stays a plain icon. */
#cq-reopen.cq-min{width:auto;height:auto;min-width:26px;border-radius:16px;padding:6px 12px;background:transparent;border:1.5px solid var(--cq-accent);color:var(--cq-accent);opacity:.85;font-size:14px;line-height:1}
#cq-reopen.cq-min:hover{opacity:1}
#cq-reopen .cq-reopen-label{display:none}
#cq-reopen.cq-min .cq-reopen-label{display:inline;margin-left:6px;font-size:13px;font-weight:600;vertical-align:middle}
</style>

<div id="cq-overlay">
  <div id="cq-box" role="dialog" aria-modal="true" aria-label="<?php echo esc_attr( $t['title'] ); ?>">
    <button class="cq-close" id="cq-close" type="button" aria-label="<?php echo esc_attr( $t['close'] ); ?>" title="<?php echo esc_attr( $t['close'] ); ?>">&times;</button>
    <div class="cq-head">
      <h2><?php echo esc_html( $t['title'] ); ?></h2>
      <p><?php echo esc_html( $t['intro'] ); ?></p>
    </div>

    <div class="cq-cats">
      <div class="cq-cat">
        <div class="cq-cat-info">
          <div class="cq-cat-name"><?php echo esc_html( $t['necessary'] ); ?></div>
          <div class="cq-cat-desc"><?php echo esc_html( $t['necessary_desc'] ); ?></div>
        </div>
        <label class="cq-toggle"><input type="checkbox" id="cq-necessary" checked disabled><span class="cq-slider"></span></label>
      </div>
      <div class="cq-cat">
        <div class="cq-cat-info">
          <div class="cq-cat-name"><?php echo esc_html( $t['preferences'] ); ?></div>
          <div class="cq-cat-desc"><?php echo esc_html( $t['preferences_desc'] ); ?></div>
        </div>
        <label class="cq-toggle"><input type="checkbox" id="cq-preferences"><span class="cq-slider"></span></label>
      </div>
      <div class="cq-cat">
        <div class="cq-cat-info">
          <div class="cq-cat-name"><?php echo esc_html( $t['statistics'] ); ?></div>
          <div class="cq-cat-desc"><?php echo esc_html( $t['statistics_desc'] ); ?></div>
        </div>
        <label class="cq-toggle"><input type="checkbox" id="cq-analytics"><span class="cq-slider"></span></label>
      </div>
      <div class="cq-cat">
        <div class="cq-cat-info">
          <div class="cq-cat-name"><?php echo esc_html( $t['marketing'] ); ?></div>
          <div class="cq-cat-desc"><?php echo esc_html( $t['marketing_desc'] ); ?></div>
        </div>
        <label class="cq-toggle"><input type="checkbox" id="cq-marketing"><span class="cq-slider"></span></label>
      </div>
    </div>

    <button class="cq-details-toggle" id="cq-details-toggle" type="button">▸ <span><?php echo esc_html( $t['show_details'] ); ?></span></button>
    <dl class="cq-details" id="cq-details"></dl>

    <div class="cq-btns">
      <button class="cq-btn cq-btn-primary" id="cq-accept-all"><?php echo esc_html( $t['accept_all'] ); ?></button>
      <button class="cq-btn cq-btn-secondary" id="cq-reject"><?php echo esc_html( $t['only_necessary'] ); ?></button>
      <button class="cq-btn cq-btn-secondary" id="cq-save"><?php echo esc_html( $t['save'] ); ?></button>
    </div>
  </div>
</div>

<button id="cq-reopen" title="<?php echo esc_attr( $t['reopen'] ); ?>">🍪<span class="cq-reopen-label">Cookies</span></button>

<script>
(function(){
  var CQ_API = '<?php echo esc_js( CORTIQ_API ); ?>';
  var CQ_SITE_ID = '<?php echo esc_js( $opts['site_id'] ); ?>';
  var CQ_TRACKING_ID = '<?php echo esc_js( $opts['tracking_id'] ); ?>';
  var CQ_T = <?php echo wp_json_encode( array(
    'show'  => $t['show_details'], 'hide' => $t['hide_details'],
    'nec'   => $t['necessary'],    'pref' => $t['preferences'],
    'stat'  => $t['statistics'],   'mark' => $t['marketing'],
    'cdate' => $t['consent_date'], 'cid'  => $t['consent_id'], 'cats' => $t['categories'],
  ) ); ?>;
  var POLICY_VERSION = '<?php echo esc_js( $opts['policy_version'] ); ?>';
  var MAX_AGE = <?php echo max( 1, intval( $opts['reprompt_cooldown_days'] ) ); ?>*24*60*60*1000; // re-ask cooldown (days)
  var GEO_GATING = <?php echo ! empty( $opts['geo_gating'] ) ? 'true' : 'false'; ?>;
  var KEY = 'site_cookie_consent';
  var overlay = document.getElementById('cq-overlay');
  var chkPref = document.getElementById('cq-preferences');
  var chkAnal = document.getElementById('cq-analytics');
  var chkMark = document.getElementById('cq-marketing');
  var details = document.getElementById('cq-details');
  var reopen  = document.getElementById('cq-reopen');
  var dToggle = document.getElementById('cq-details-toggle');
  var locale  = (navigator.language || 'sv');

  function genId(){
    var arr=new Uint8Array(33);
    (window.crypto||window.msCrypto).getRandomValues(arr);
    return btoa(String.fromCharCode.apply(null,arr)).replace(/[+/]/g,function(c){return c==='+'?'-':'_'}).substring(0,44)+'==';
  }

  function fmt(ts){
    var d=new Date(ts);
    try { return d.toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'})+' '+d.toLocaleTimeString(locale); }
    catch(e){ return d.toISOString(); }
  }

  // Reopen icon: hollow when the visitor is on necessary-only — a soft, non-nagging cue
  // that they can reconsider, without pulsing dots or notification badges.
  function iconState(c){
    var full = c && (c.preferences || c.analytics || c.marketing);
    reopen.className = full ? '' : 'cq-min';
  }

  function save(pref,anal,mark){
    var now=Date.now();
    // spa-tracking.js only honours a stored choice with a future expiresAt.
    var c={ necessary:true, preferences:pref, analytics:anal, marketing:mark,
      timestamp:now, expiresAt:new Date(now+MAX_AGE).toISOString(),
      consentId:genId(), policyVersion:POLICY_VERSION };
    try { localStorage.setItem(KEY,JSON.stringify(c)); } catch(e){}
    // GA4 Consent Mode + spa-tracking listen for this event.
    window.dispatchEvent(new CustomEvent('siteConsentUpdated',{detail:c}));
    // GDPR Art. 7: record server-side proof of consent. The backend resolves the site
    // by page domain, so this lands under the right site.
    try {
      fetch(CQ_API + '/store-consent', {
        method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
        body: JSON.stringify({
          site_id: CQ_SITE_ID || undefined, tracking_id: CQ_TRACKING_ID || undefined,
          session_id: c.consentId, page_url: location.href,
          consent_types:{ necessary:true, analytics:anal, marketing:mark, preferences:pref },
          source:'cookie_banner', gpc_signal:(navigator.globalPrivacyControl===true),
          policy_version: POLICY_VERSION, locale: locale.substring(0,10)
        })
      }).catch(function(){});
    } catch(e){}
    overlay.style.display='none';
    reopen.style.display='block';
    iconState(c); showDetails(c);
  }

  function showDetails(c){
    if(!c) return;
    var cats = CQ_T.nec
      + (c.preferences?', '+CQ_T.pref:'')
      + (c.analytics?', '+CQ_T.stat:'')
      + (c.marketing?', '+CQ_T.mark:'');
    details.innerHTML =
      '<dt>'+CQ_T.cdate+'</dt><dd>'+fmt(c.timestamp)+'</dd>'+
      '<dt>'+CQ_T.cid+'</dt><dd>'+c.consentId+'</dd>'+
      '<dt>'+CQ_T.cats+'</dt><dd>'+cats+'</dd>';
  }

  if(dToggle){ dToggle.onclick=function(){
    var open=details.style.display==='block';
    details.style.display=open?'none':'block';
    var span=dToggle.querySelector('span'); if(span){ span.textContent=open?CQ_T.show:CQ_T.hide; }
  }; }

  document.getElementById('cq-accept-all').onclick=function(){
    chkPref.checked=true; if(chkAnal){ chkAnal.checked=true; } chkMark.checked=true;
    save(true, !!chkAnal, true);
  };
  document.getElementById('cq-reject').onclick=function(){
    chkPref.checked=false; if(chkAnal){ chkAnal.checked=false; } chkMark.checked=false;
    save(false,false,false);
  };
  document.getElementById('cq-save').onclick=function(){
    save(chkPref.checked, chkAnal?chkAnal.checked:false, chkMark.checked);
  };
  reopen.onclick=function(){ overlay.style.display='flex'; reopen.style.display='none'; };

  // Close (X): dismissing the banner must NOT imply consent (EDPB) — it saves the
  // GDPR-safe default of necessary only, so the banner is answered and won't nag.
  var closeBtn=document.getElementById('cq-close');
  if(closeBtn){ closeBtn.onclick=function(){
    chkPref.checked=false; if(chkAnal){ chkAnal.checked=false; } chkMark.checked=false;
    save(false,false,false);
  }; }

  var existing;
  try{ existing=JSON.parse(localStorage.getItem(KEY)); }catch(e){}
  // Show the banner only if there's no fresh decision. A saved choice (even reject) is
  // respected for ~12 months — no nagging.
  var fresh = existing && existing.policyVersion===POLICY_VERSION && ((Date.now()-(existing.timestamp||0)) < MAX_AGE);
  // Choices saved by plugin < 5.4.0 have no expiresAt, so spa-tracking.js ignores them.
  // Backfill it here: this footer script runs before the deferred tracker executes.
  if(fresh && !(Date.parse(existing.expiresAt) > Date.now())){
    existing.expiresAt=new Date(existing.timestamp+MAX_AGE).toISOString();
    try { localStorage.setItem(KEY,JSON.stringify(existing)); } catch(e){}
  }
  function showBanner(){
    if(!GEO_GATING){ overlay.style.display='flex'; return; }
    // Geo-gated: only show inside the EEA/UK/CH; elsewhere no cookie banner is required.
    // Fail-safe: show the banner on any error.
    fetch(CQ_API + '/geo-check').then(function(r){ return r.json(); }).then(function(g){
      if(g && g.in_scope === false){ reopen.style.display='block'; }
      else { overlay.style.display='flex'; }
    }).catch(function(){ overlay.style.display='flex'; });
  }
  if(!fresh){
    showBanner();
  } else {
    chkPref.checked=!!existing.preferences;
    if(chkAnal){ chkAnal.checked=!!existing.analytics; }
    chkMark.checked=!!existing.marketing;
    reopen.style.display='block';
    iconState(existing); showDetails(existing);
  }
})();
</script>
    <?php
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Analytics 4
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'wp_head', 'cortiq_ga4_output', 1 );
function cortiq_ga4_output() {
    $opts = cortiq_options();
    if ( empty( $opts['tracking_enabled'] ) ) return;
    if ( empty( $opts['ga4_id'] ) ) return;

    if ( is_user_logged_in() ) {
        $user  = wp_get_current_user();
        $roles = (array) $opts['excluded_roles'];
        if ( array_intersect( $roles, (array) $user->roles ) ) return;
    }

    $ga4_id   = esc_js( $opts['ga4_id'] );
    $gdpr_on  = ! empty( $opts['gdpr_enabled'] );
    $advanced = ( 'advanced' === $opts['consent_mode'] );
    ?>
<!-- Google Analytics 4 via CortIQ (Consent Mode v2) -->
<script>
(function(){
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  var GA_ID    = '<?php echo $ga4_id; ?>';
  var GDPR     = <?php echo $gdpr_on ? 'true' : 'false'; ?>;
  var ADVANCED = <?php echo $advanced ? 'true' : 'false'; ?>;

  if ( GDPR ) {
    // Deny by default until the banner grants consent (Consent Mode v2). All six v2
    // signals; security_storage is always granted (strictly necessary).
    var consentDefaults={ ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied', analytics_storage:'denied', functionality_storage:'denied', personalization_storage:'denied', security_storage:'granted', wait_for_update:500 };
<?php if ( 'eea' === $opts['consent_region'] ) : ?>
    // Region-scoped: visitors OUTSIDE the EEA/UK/CH are not gated by these defaults.
    consentDefaults.region=['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','GB','CH'];
<?php endif; ?>
    gtag('consent','default',consentDefaults);
    gtag('set','ads_data_redaction',true); // redact ad-click IDs while denied
    gtag('set','url_passthrough',true);    // preserve gclid/dclid in URLs without cookies
  }
  gtag('js', new Date());

  var loaded = false;
  function loadGA(){
    if ( loaded ) return; loaded = true;
    gtag('config', GA_ID);
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }
  function hasAnalytics(){
    try { var c = JSON.parse(localStorage.getItem('site_cookie_consent') || 'null'); return !!(c && c.analytics); }
    catch(e){ return false; }
  }

  // Basic (default): GA4 does not load until analytics consent — cleanest legally.
  // Advanced (or GDPR off): GA4 loads now and sends cookieless pings until consent.
  if ( !GDPR || ADVANCED || hasAnalytics() ) {
    loadGA();
    if ( hasAnalytics() ) { gtag('consent','update',{ analytics_storage:'granted' }); }
  }

  window.addEventListener('siteConsentUpdated', function(e){
    var d = e.detail || {};
    gtag('consent','update',{
      analytics_storage: d.analytics ? 'granted' : 'denied',
      ad_storage:        d.marketing ? 'granted' : 'denied',
      ad_user_data:      d.marketing ? 'granted' : 'denied',
      ad_personalization:d.marketing ? 'granted' : 'denied',
      functionality_storage:   d.preferences ? 'granted' : 'denied',
      personalization_storage: d.preferences ? 'granted' : 'denied'
    });
    if ( d.analytics ) { loadGA(); }
  });
})();
</script>
    <?php
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: settings page
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'admin_menu', 'cortiq_admin_menu' );
function cortiq_admin_menu() {
    add_options_page(
        'CortIQ Analytics',
        'CortIQ Analytics',
        'manage_options',
        'cortiq',
        'cortiq_settings_page'
    );
}

add_action( 'admin_init', 'cortiq_register_settings' );
function cortiq_register_settings() {
    register_setting( 'cortiq_settings_group', CORTIQ_OPTION_KEY, array(
        'sanitize_callback' => 'cortiq_sanitize_options',
    ) );
}

function cortiq_sanitize_options( $input ) {
    $clean                     = cortiq_defaults();
    $clean['site_id']          = isset( $input['site_id'] )
        ? sanitize_text_field( $input['site_id'] ) : '';
    $clean['tracking_id']      = isset( $input['tracking_id'] )
        ? sanitize_text_field( $input['tracking_id'] ) : '';
    $clean['ga4_id']           = isset( $input['ga4_id'] )
        ? sanitize_text_field( $input['ga4_id'] ) : '';
    $clean['tracking_enabled'] = ! empty( $input['tracking_enabled'] );
    $clean['gdpr_enabled']     = ! empty( $input['gdpr_enabled'] );
    $clean['anonymize_ip']     = ! empty( $input['anonymize_ip'] );
    $clean['excluded_roles']   = array( 'administrator' );
    // Validate the banner accent colour; sanitize_hex_color() returns '' if invalid.
    $ac = isset( $input['accent_color'] ) ? sanitize_hex_color( trim( (string) $input['accent_color'] ) ) : '';
    $clean['accent_color']     = $ac ? $ac : '#6366f1';
    $clean['tracking_mode']    = ( isset( $input['tracking_mode'] ) && 'cookieless' === $input['tracking_mode'] ) ? 'cookieless' : 'full';
    $bl = isset( $input['banner_language'] ) ? $input['banner_language'] : 'auto';
    $clean['banner_language']  = in_array( $bl, array( 'auto', 'en', 'sv', 'de', 'fr', 'pt' ), true ) ? $bl : 'auto';
    $clean['consent_mode']     = ( isset( $input['consent_mode'] ) && 'advanced' === $input['consent_mode'] ) ? 'advanced' : 'basic';
    $pv = isset( $input['policy_version'] ) ? substr( sanitize_text_field( $input['policy_version'] ), 0, 20 ) : '1';
    $clean['policy_version']   = ( '' !== $pv ) ? $pv : '1';
    $cd = isset( $input['reprompt_cooldown_days'] ) ? intval( $input['reprompt_cooldown_days'] ) : 365;
    $clean['reprompt_cooldown_days'] = ( $cd >= 1 && $cd <= 400 ) ? $cd : 365;
    $clean['consent_region']   = ( isset( $input['consent_region'] ) && 'global' === $input['consent_region'] ) ? 'global' : 'eea';
    $clean['geo_gating']       = ! empty( $input['geo_gating'] );
    return $clean;
}

function cortiq_settings_page() {
    if ( ! current_user_can( 'manage_options' ) ) return;
    $opts = cortiq_options();
    ?>
    <div class="wrap">
        <h1 style="display:flex;align-items:center;gap:10px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                 stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            CortIQ Analytics
        </h1>

        <?php settings_errors( 'cortiq_settings_group' ); ?>

        <form method="post" action="options.php">
            <?php settings_fields( 'cortiq_settings_group' ); ?>

            <table class="form-table" role="presentation">

                <tr>
                    <th scope="row"><label for="cortiq_site_id">Site ID</label></th>
                    <td>
                        <input id="cortiq_site_id"
                               name="<?php echo CORTIQ_OPTION_KEY; ?>[site_id]"
                               type="text"
                               value="<?php echo esc_attr( $opts['site_id'] ); ?>"
                               class="regular-text"
                               placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                        <p class="description">
                            UUID from <a href="https://cortiq.se/dashboard" target="_blank">CortIQ Dashboard</a>
                            → Settings → Setup. Used for <strong>AI tracking</strong> (bots, search, citations).
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="cortiq_tracking_id">Tracking ID</label></th>
                    <td>
                        <input id="cortiq_tracking_id"
                               name="<?php echo CORTIQ_OPTION_KEY; ?>[tracking_id]"
                               type="text"
                               value="<?php echo esc_attr( $opts['tracking_id'] ); ?>"
                               class="regular-text"
                               placeholder="tk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                        <p class="description">
                            tk_xxx key from Dashboard → Settings → Setup. Used for
                            <strong>heatmaps, sessions and page views</strong>.
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="cortiq_ga4_id">Google Analytics 4</label></th>
                    <td>
                        <input id="cortiq_ga4_id"
                               name="<?php echo CORTIQ_OPTION_KEY; ?>[ga4_id]"
                               type="text"
                               value="<?php echo esc_attr( $opts['ga4_id'] ); ?>"
                               class="regular-text"
                               placeholder="G-XXXXXXXXXX" />
                        <p class="description">
                            Your GA4 Measurement ID. Found in
                            <a href="https://analytics.google.com" target="_blank">Google Analytics</a>
                            → Admin → Data Streams → your stream → Measurement ID.
                            Leave empty to disable GA4.
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row">Tracking</th>
                    <td>
                        <label>
                            <input type="checkbox"
                                   name="<?php echo CORTIQ_OPTION_KEY; ?>[tracking_enabled]"
                                   value="1"
                                   <?php checked( ! empty( $opts['tracking_enabled'] ) ); ?> />
                            Enable tracking
                        </label>
                    </td>
                </tr>

                <tr>
                    <th scope="row">Privacy</th>
                    <td>
                        <label>
                            <input type="checkbox"
                                   name="<?php echo CORTIQ_OPTION_KEY; ?>[gdpr_enabled]"
                                   value="1"
                                   <?php checked( ! empty( $opts['gdpr_enabled'] ) ); ?> />
                            Show cookie consent banner (GDPR)
                        </label>
                        <p class="description">Uncheck if your theme or another plugin already handles cookie consent.</p>
                        <br>
                        <label>
                            <input type="checkbox"
                                   name="<?php echo CORTIQ_OPTION_KEY; ?>[anonymize_ip]"
                                   value="1"
                                   <?php checked( ! empty( $opts['anonymize_ip'] ) ); ?> />
                            Anonymize IP addresses
                        </label>
                        <br>
                        <label>
                            <input type="checkbox"
                                   name="<?php echo CORTIQ_OPTION_KEY; ?>[geo_gating]"
                                   value="1"
                                   <?php checked( ! empty( $opts['geo_gating'] ) ); ?> />
                            Show the cookie banner only to EEA / UK / Switzerland visitors
                        </label>
                        <p class="description">Visitors outside the EEA/UK/CH won't see the banner. Without a choice, CortIQ visitor analytics stay off for them; AI-agent and bot detection still runs.</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row">Tracking mode</th>
                    <td>
                        <label style="display:block;margin-bottom:8px">
                            <input type="radio" name="<?php echo CORTIQ_OPTION_KEY; ?>[tracking_mode]" value="cookieless"
                                   <?php checked( 'cookieless', $opts['tracking_mode'] ); ?> />
                            <strong>Cookieless</strong> — privacy-minimised measurement. No fingerprint, no cross-visit profile.
                            Requires analytics consent (<em>Statistics</em> in the banner).
                        </label>
                        <label style="display:block">
                            <input type="radio" name="<?php echo CORTIQ_OPTION_KEY; ?>[tracking_mode]" value="full"
                                   <?php checked( 'full', $opts['tracking_mode'] ); ?> />
                            <strong>Full</strong> — device fingerprint + returning-visitor profiling. Requires analytics consent.
                        </label>
                        <p class="description">Both modes need analytics consent before visitor analytics start. AI-agent and bot detection runs without it as a strictly necessary security function — you decide the legal basis for your site.</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="cortiq_banner_language">Banner language</label></th>
                    <td>
                        <select id="cortiq_banner_language" name="<?php echo CORTIQ_OPTION_KEY; ?>[banner_language]">
                            <option value="auto" <?php selected( 'auto', $opts['banner_language'] ); ?>>Auto (WordPress locale)</option>
                            <option value="en"   <?php selected( 'en',   $opts['banner_language'] ); ?>>English</option>
                            <option value="sv"   <?php selected( 'sv',   $opts['banner_language'] ); ?>>Svenska</option>
                            <option value="de"   <?php selected( 'de',   $opts['banner_language'] ); ?>>Deutsch</option>
                            <option value="fr"   <?php selected( 'fr',   $opts['banner_language'] ); ?>>Français</option>
                            <option value="pt"   <?php selected( 'pt',   $opts['banner_language'] ); ?>>Português</option>
                        </select>
                        <p class="description">Language for the cookie banner. Auto follows your site's WordPress language.</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row">GA4 Consent Mode</th>
                    <td>
                        <label style="display:block;margin-bottom:8px">
                            <input type="radio" name="<?php echo CORTIQ_OPTION_KEY; ?>[consent_mode]" value="basic"
                                   <?php checked( 'basic', $opts['consent_mode'] ); ?> />
                            <strong>Basic</strong> — GA4 loads only after the visitor accepts Statistics. Cleanest legally.
                        </label>
                        <label style="display:block">
                            <input type="radio" name="<?php echo CORTIQ_OPTION_KEY; ?>[consent_mode]" value="advanced"
                                   <?php checked( 'advanced', $opts['consent_mode'] ); ?> />
                            <strong>Advanced</strong> — GA4 loads immediately and sends cookieless pings; Google models the gaps.
                        </label>
                        <p class="description">Only affects sites with a GA4 ID.</p>
                    </td>
                </tr>

                <tr>
                    <th scope="row">Consent scope &amp; policy</th>
                    <td>
                        <p style="margin:0 0 10px">
                            <label for="cortiq_consent_region"><strong>Geo scope for consent defaults</strong></label><br>
                            <select id="cortiq_consent_region" name="<?php echo CORTIQ_OPTION_KEY; ?>[consent_region]">
                                <option value="eea"    <?php selected( 'eea',    $opts['consent_region'] ); ?>>EEA + UK + Switzerland (region-scoped)</option>
                                <option value="global" <?php selected( 'global', $opts['consent_region'] ); ?>>Global (apply everywhere)</option>
                            </select>
                            <span class="description"> Region-scoped means visitors outside the EEA/UK/CH aren't gated by Consent Mode defaults.</span>
                        </p>
                        <p style="margin:0 0 10px">
                            <label for="cortiq_policy_version"><strong>Policy version</strong></label><br>
                            <input id="cortiq_policy_version" type="text"
                                   name="<?php echo CORTIQ_OPTION_KEY; ?>[policy_version]"
                                   value="<?php echo esc_attr( $opts['policy_version'] ); ?>" style="max-width:120px" />
                            <span class="description"> Change this to re-prompt every visitor (e.g. after updating your cookie/privacy policy).</span>
                        </p>
                        <p style="margin:0">
                            <label for="cortiq_cooldown"><strong>Re-ask cooldown (days)</strong></label><br>
                            <input id="cortiq_cooldown" type="number" min="1" max="400"
                                   name="<?php echo CORTIQ_OPTION_KEY; ?>[reprompt_cooldown_days]"
                                   value="<?php echo esc_attr( $opts['reprompt_cooldown_days'] ); ?>" style="max-width:90px" />
                            <span class="description"> How long a saved choice (incl. reject) is respected before asking again. Default 365.</span>
                        </p>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="cortiq_accent_color">Banner color</label></th>
                    <td>
                        <input id="cortiq_accent_color"
                               name="<?php echo CORTIQ_OPTION_KEY; ?>[accent_color]"
                               type="text"
                               value="<?php echo esc_attr( $opts['accent_color'] ); ?>"
                               style="max-width:110px;vertical-align:middle"
                               placeholder="#6366f1" />
                        <input type="color" id="cortiq_accent_picker"
                               value="<?php echo esc_attr( $opts['accent_color'] ); ?>"
                               style="vertical-align:middle;width:40px;height:30px;padding:0;border:1px solid #ccc;border-radius:4px;cursor:pointer" />
                        <span style="display:inline-flex;gap:6px;margin-left:12px;vertical-align:middle">
                            <?php foreach ( array( '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#111827' ) as $c ) : ?>
                                <button type="button" class="cortiq-swatch" data-color="<?php echo esc_attr( $c ); ?>"
                                        title="<?php echo esc_attr( $c ); ?>"
                                        style="width:22px;height:22px;border-radius:50%;border:1px solid rgba(0,0,0,.2);background:<?php echo esc_attr( $c ); ?>;cursor:pointer;padding:0"></button>
                            <?php endforeach; ?>
                        </span>
                        <p class="description">Accent colour for the cookie banner and the reopen button. Pick a preset, use the colour picker, or type any hex value.</p>
                        <script>
                        (function(){
                            var txt  = document.getElementById('cortiq_accent_color');
                            var pick = document.getElementById('cortiq_accent_picker');
                            if ( pick ) pick.addEventListener('input', function(){ txt.value = pick.value; });
                            document.querySelectorAll('.cortiq-swatch').forEach(function(b){
                                b.addEventListener('click', function(){
                                    var v = b.getAttribute('data-color');
                                    txt.value = v;
                                    try { pick.value = v; } catch(e){}
                                });
                            });
                        })();
                        </script>
                    </td>
                </tr>

            </table>

            <?php submit_button( 'Save Settings' ); ?>
        </form>

        <hr>
        <h2>Status</h2>
        <table class="widefat" style="max-width:520px;">
            <tbody>
                <tr>
                    <td><strong>Version</strong></td>
                    <td><?php echo esc_html( CORTIQ_VERSION ); ?></td>
                </tr>
                <tr>
                    <td><strong>Site ID</strong></td>
                    <td>
                        <?php if ( ! empty( $opts['site_id'] ) ) : ?>
                            <span style="color:green">&#10003; Configured</span>
                            &nbsp;<code><?php echo esc_html( $opts['site_id'] ); ?></code>
                        <?php else : ?>
                            <span style="color:#d63638">&#10007; Not set</span>
                            <span style="color:#777"> — AI tracking disabled</span>
                        <?php endif; ?>
                    </td>
                </tr>
                <tr>
                    <td><strong>Tracking ID</strong></td>
                    <td>
                        <?php if ( ! empty( $opts['tracking_id'] ) ) : ?>
                            <span style="color:green">&#10003; Configured</span>
                            &nbsp;<code><?php echo esc_html( $opts['tracking_id'] ); ?></code>
                        <?php else : ?>
                            <span style="color:#d63638">&#10007; Not set</span>
                            <span style="color:#777"> — heatmaps/sessions disabled</span>
                        <?php endif; ?>
                    </td>
                </tr>
                <tr>
                    <td><strong>Google Analytics 4</strong></td>
                    <td>
                        <?php if ( ! empty( $opts['ga4_id'] ) ) : ?>
                            <span style="color:green">&#10003; Active</span>
                            &nbsp;<code><?php echo esc_html( $opts['ga4_id'] ); ?></code>
                        <?php else : ?>
                            <span style="color:#777">Not configured</span>
                        <?php endif; ?>
                    </td>
                </tr>
                <tr>
                    <td><strong>Tracking</strong></td>
                    <td>
                        <?php echo ! empty( $opts['tracking_enabled'] )
                            ? '<span style="color:green">&#10003; Active</span>'
                            : '<span style="color:gray">Paused</span>'; ?>
                    </td>
                </tr>
            </tbody>
        </table>

        <hr>
        <h2>Script loaded</h2>
        <table class="widefat" style="max-width:520px;">
            <thead><tr><th>Script</th><th>Covers</th><th>Status</th></tr></thead>
            <tbody>
                <tr>
                    <td><code>spa-tracking.js</code></td>
                    <td>Heatmaps · Sessions · AI Agents · Bots · Citations · UTM</td>
                    <td>
                        <?php echo ! empty( $opts['site_id'] ) && ! empty( $opts['tracking_enabled'] )
                            ? '<span style="color:green">&#10003; Active</span>'
                            : '<span style="color:#d63638">Needs Site ID</span>'; ?>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    <?php
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin notice: missing IDs
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'admin_notices', 'cortiq_admin_notice' );
function cortiq_admin_notice() {
    if ( ! current_user_can( 'manage_options' ) ) return;
    $screen = get_current_screen();
    if ( $screen && $screen->id === 'settings_page_cortiq' ) return;

    $opts = cortiq_options();
    if ( ! empty( $opts['site_id'] ) ) return;

    $url = admin_url( 'options-general.php?page=cortiq' );
    echo '<div class="notice notice-warning is-dismissible"><p>'
        . '<strong>CortIQ Analytics:</strong> '
        . 'Add your Site ID to enable tracking. '
        . '<a href="' . esc_url( $url ) . '">Go to settings &rarr;</a>'
        . '</p></div>';
}
