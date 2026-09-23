import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import PublicNavigation from "@/components/PublicNavigation";
import { useSEO } from "@/hooks/useSEO";
import { Shield, CheckCircle, Mail, FileText, Lock, Database, Users, BarChart3, Megaphone } from "lucide-react";

const LAST_UPDATED = "September 23, 2026";

const Privacy = () => {
  useSEO({
    title: 'Privacy Policy — CortIQ',
    description: 'CortIQ privacy policy: what is processed without consent (security and bot detection), what requires analytics or marketing consent, EU data storage, retention periods and your rights.',
  });
  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-gradient-primary text-white">
            Privacy Policy
          </Badge>
          <h1 className="text-4xl md:text-5xl font-black mb-6 text-gradient-primary">
            We Respect Your Privacy
          </h1>
          <p className="text-xl text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="space-y-8">
          {/* Introduction */}
          <Card className="glass shadow-elegant">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Shield className="h-6 w-6 text-primary" />
                <CardTitle>1. Introduction</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                CortIQ ("we", "us", "our") respects your privacy and is committed to protecting your personal data.
                This privacy policy explains how we collect and use data when you use our analytics platform.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Processing on websites that use CortIQ falls into three tiers:
              </p>
              <ul className="text-muted-foreground space-y-2 ml-4">
                <li>• <strong>Without consent</strong> — security, AI-bot and agent detection, and server/edge logs (section 3).</li>
                <li>• <strong>With analytics (Statistics) consent</strong> — all visitor analytics, in both Cookieless and Full mode (section 5).</li>
                <li>• <strong>With marketing consent</strong> — advertising click IDs and conversion feedback to ad platforms (section 5A).</li>
              </ul>
            </CardContent>
          </Card>

          {/* Data Controller */}
          <Card className="glass shadow-elegant">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <FileText className="h-6 w-6 text-primary" />
                <CardTitle>2. Data Controller</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-muted-foreground">
                <p><strong>Legal entity:</strong> Expandtalk Corporation AB</p>
                <p><strong>Product:</strong> CortIQ</p>
                <p><strong>Company registration number:</strong> 559358-8824</p>
                <p><strong>Registered address:</strong> Parmmätaregatan 4B, 417 04 Göteborg, Sweden</p>
                <p><strong>Email:</strong> privacy@cortiq.se</p>
                <p className="text-sm mt-3">
                  For analytics data collected on our customers' websites, CortIQ acts as a
                  <strong> processor</strong> on behalf of the site operator (the controller). For our own
                  account, billing and platform data, CortIQ (Expandtalk Corporation AB) is the
                  <strong> controller</strong>.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Security & Bot Detection */}
          <Card className="glass shadow-elegant border-primary/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Shield className="h-6 w-6 text-primary" />
                <CardTitle>3A. Security &amp; AI-Bot Detection (Without consent)</CardTitle>
              </div>
              <Badge className="w-fit bg-gradient-accent text-white">Security layer</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                Before any consent choice is made, the CortIQ script runs only a limited security and
                bot-detection layer:
              </p>
              <ul className="space-y-3">
                {[
                  'AI bot and agent detection (e.g. ChatGPT Browser, Perplexity Comet, Claude Browser) based on the User-Agent string and browser capability signals',
                  'Crawler classification (training crawlers, citation crawlers, search engines, scrapers)',
                  'Bot probe — runs only when the client looks automated; ordinary browsers send nothing',
                  'Honeypot and canary links — invisible elements that only automated clients interact with'
                ].map((item, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="bg-primary/5 p-4 rounded-lg mt-4">
                <ul className="text-sm text-muted-foreground space-y-2 ml-4">
                  <li>• No cookies are set and no analytics identifiers are stored by this layer. It uses a random identifier that exists only for the current page load.</li>
                  <li>• If a client is classified as automated, a page-depth counter (<code>_ciq_adp</code>) is kept in sessionStorage for that tab session.</li>
                  <li>• Data from this layer is used for security, abuse prevention and bot classification — not for advertising or visitor profiling.</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  <strong className="text-foreground">Legal basis (our assessment):</strong> legitimate interest
                  (GDPR Art. 6.1.f) in protecting websites against abuse and in identifying automated traffic. To the
                  extent the script accesses information on the device, we consider this strictly necessary for the
                  security of the service within the meaning of ePrivacy Directive Art. 5.3. This is our
                  interpretation; supervisory authorities may take a different view, and site operators remain
                  responsible for their own assessment.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Server & Edge Logs */}
          <Card className="glass shadow-elegant border-primary/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Database className="h-6 w-6 text-primary" />
                <CardTitle>3B. Server &amp; Edge Logs (Without consent)</CardTitle>
              </div>
              <Badge className="w-fit bg-gradient-accent text-white">Operations &amp; security</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                Every HTTP request produces a log entry on the web server, and — where the site operator enables the
                Cloudflare integration — at Cloudflare's edge. CortIQ processes these raw logs for technical
                operation, security and bot classification.
              </p>

              <div className="bg-primary/10 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 text-foreground">Data in a log entry</h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <strong>Timestamp</strong> of the request</li>
                  <li>• <strong>HTTP method and URL path</strong> (e.g. GET /products/product-123)</li>
                  <li>• <strong>HTTP status code</strong> (200, 404, 500)</li>
                  <li>• <strong>User-Agent</strong> (used for crawler and bot classification)</li>
                  <li>• <strong>Referrer</strong></li>
                  <li>• <strong>Country</strong>, derived from the IP address</li>
                  <li>• <strong>Truncated IP address</strong> — the last octet is removed (/24 subnet) before CortIQ stores it; the full IP address is not stored</li>
                  <li>• <strong>Request identifier</strong> (e.g. Cloudflare Ray ID) and load time</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  <strong>Retention:</strong> see section 9.
                </p>
              </div>

              <div className="bg-primary/5 p-4 rounded-lg mt-4">
                <ul className="text-sm text-muted-foreground space-y-2 ml-4">
                  <li>• Log processing sets nothing on the visitor's device.</li>
                  <li>• Log data is used to operate the service, detect errors and attacks, and classify crawlers and AI bots (which typically do not execute JavaScript and are only visible in logs).</li>
                  <li>• Log data is not used to build visitor profiles and is not shared with advertising recipients.</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  <strong className="text-foreground">Legal basis (our assessment):</strong> legitimate interest
                  (GDPR Art. 6.1.f) in operating and securing the service. Server logging does not involve storing or
                  reading information on the visitor's device.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* First-Party Data Collection */}
          <Card className="glass shadow-elegant border-primary/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Users className="h-6 w-6 text-primary" />
                <CardTitle>4. First-Party Data from Logged-In Users</CardTitle>
              </div>
              <Badge className="w-fit bg-gradient-primary text-white">Contractual basis</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                For <strong>logged-in users</strong>, we collect data necessary to provide the service:
              </p>
              <ul className="space-y-3">
                {[
                  'Email address (from registration form)',
                  'CRM events (purchases, bookings, interactions)',
                  'User activity linked to your account',
                  'Data you consciously submit via forms',
                  'Platform usage to improve the service'
                ].map((item, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="bg-primary/5 p-4 rounded-lg mt-4">
                <p className="text-sm text-muted-foreground mb-2">
                  <strong className="text-foreground">Legal Basis:</strong>
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <strong>Contractual basis</strong> (GDPR Art. 6.1.b) - Necessary to provide the service</li>
                  <li>• <strong>Legitimate interest</strong> (GDPR Art. 6.1.f) - Improve platform based on user activity</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-2">
                  <strong className="text-foreground">Note:</strong> This covers account holders of the CortIQ
                  platform. It is separate from the visitor analytics described in section 5, which always requires
                  consent.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Visitor Analytics with Consent */}
          <Card className="glass shadow-elegant border-accent/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <BarChart3 className="h-6 w-6 text-accent" />
                <CardTitle>5. Visitor Analytics (Requires analytics consent)</CardTitle>
              </div>
              <Badge className="w-fit bg-gradient-primary text-white">With your approval</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                All visitor analytics starts <strong>only after you grant analytics (Statistics) consent</strong>.
                This applies in both Cookieless and Full mode:
              </p>
              <ul className="space-y-3">
                {[
                  'Page views and most visited pages',
                  'AI referrals — when a visit arrives from an AI service such as ChatGPT or Perplexity (referrer, landing URL, UTM parameters, device type)',
                  'Referrers and traffic sources (including UTM parameters)',
                  'Sessions, device type, browser and country',
                  'Clicks and link clicks',
                  'Scroll depth and heatmaps',
                  'Form interactions (field content is not captured) and form submissions',
                  'E-commerce events and conversions',
                  'Session recording, where enabled by the site operator (section 5B)'
                ].map((item, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-accent/5 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-foreground">Cookieless mode</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                    <li>• No cookies</li>
                    <li>• No device fingerprinting</li>
                    <li>• No cross-visit or cross-site profile</li>
                    <li>• Session identifier held in memory only</li>
                    <li>• No advertising click IDs</li>
                    <li>• Still requires consent</li>
                  </ul>
                </div>
                <div className="bg-accent/5 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-foreground">Full mode</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                    <li>• Session identifier in sessionStorage (deleted when the tab closes)</li>
                    <li>• Visitor identification across page views, used to link sessions and conversions</li>
                    <li>• Marketing features only with marketing consent (section 5A)</li>
                  </ul>
                </div>
              </div>

              <div className="bg-accent/5 p-4 rounded-lg mt-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Legal basis:</strong> consent (GDPR Art. 6.1.a; ePrivacy
                  Directive Art. 5.3).
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  <strong className="text-foreground">Withdrawal:</strong> you can withdraw consent at any time via
                  the site's cookie settings. Tracking stops immediately, and the session identifier and any stored
                  click IDs are cleared from your browser. Withdrawal does not affect processing carried out before it.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Marketing with Consent */}
          <Card className="glass shadow-elegant border-accent/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Megaphone className="h-6 w-6 text-accent" />
                <CardTitle>5A. Marketing &amp; Advertising Measurement (Requires marketing consent)</CardTitle>
              </div>
              <Badge className="w-fit bg-gradient-primary text-white">With your approval</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                In Full mode, and only if you grant <strong>marketing</strong> consent, CortIQ may also process:
              </p>
              <ul className="space-y-2 text-muted-foreground text-sm ml-4">
                <li>• Advertising click IDs from the page URL (<code>gclid</code>, <code>fbclid</code>, <code>msclkid</code>, <code>ttclid</code>, <code>li_fat_id</code>), kept in sessionStorage for the tab session and linked to conversions.</li>
                <li>• Conversion feedback to advertising platforms (e.g. Google Ads Enhanced Conversions), using a SHA-256 hash of an email address submitted in a form together with the click ID (section 5C).</li>
                <li>• Canvas/WebGL device signals for visitor identification — only where the site operator has explicitly enabled this feature.</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                None of the above runs in Cookieless mode or without marketing consent.
              </p>
              <div className="bg-accent/5 p-4 rounded-lg mt-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Legal basis:</strong> consent (GDPR Art. 6.1.a; ePrivacy
                  Directive Art. 5.3).
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Session Replay */}
          <Card className="glass shadow-elegant border-accent/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Lock className="h-6 w-6 text-accent" />
                <CardTitle>5B. Session Replay (Requires consent)</CardTitle>
              </div>
              <Badge className="w-fit bg-gradient-primary text-white">With your approval</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                If the site operator enables session replay and you give consent, we record a
                reconstruction of your session (page structure, navigation, clicks and scrolling)
                using the rrweb library, so operators can understand usability issues.
              </p>
              <ul className="space-y-2 text-muted-foreground text-sm ml-4">
                <li>• Text input into form fields is masked by default.</li>
                <li>• On-screen text masking is enabled by default; operators may unmask non-sensitive pages.</li>
                <li>• Elements marked <code>.sensitive</code> or <code>[data-private]</code> are excluded from capture.</li>
                <li>• Recordings are retained according to the operator's configured period and then deleted.</li>
              </ul>
              <div className="bg-accent/5 p-4 rounded-lg mt-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Legal Basis:</strong> Consent (Art. 6.1.a GDPR / ePrivacy Art. 5.3). Session replay is never active without it.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Third-Party Recipients */}
          <Card className="glass shadow-elegant border-accent/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Users className="h-6 w-6 text-accent" />
                <CardTitle>5C. Third-Party Recipients &amp; Processors</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                We use the following processors and, for consent-based advertising features, share
                data with the following recipients:
              </p>
              <ul className="space-y-3 text-muted-foreground text-sm ml-4">
                <li>• <strong>Supabase</strong> (infrastructure / database hosting, EU region) — processor for all analytics data.</li>
                <li>• <strong>Anthropic</strong> (AI assistant &amp; GEO analysis, USA) — when you use AI features, relevant analytics results are sent to the Claude API to generate answers.</li>
                <li>• <strong>Google Ads</strong> (Enhanced Conversions for Leads, USA) — when the operator enables conversion feedback and marketing consent was given, a SHA-256 hash of the email plus the ad click ID (gclid) and conversion value are uploaded. The raw email never leaves the browser.</li>
                <li>• <strong>HubSpot</strong> (CRM lead-quality feedback, USA/EU) — when the operator connects HubSpot, lead-quality signals are exchanged to enrich conversion measurement.</li>
                <li>• <strong>Cloudflare</strong> (edge logs &amp; geo lookup, USA — EU-US DPF certified) — when the operator enables the Cloudflare integration, Cloudflare processes visitor IP addresses at its edge; CortIQ receives the country and a truncated IP address for security and bot classification (section 3B).</li>
              </ul>
              <div className="bg-accent/5 p-4 rounded-lg mt-4">
                <p className="text-sm text-muted-foreground">
                  Note: a SHA-256 hash of an email address is still considered personal data
                  (pseudonymised) under GDPR. Advertising uploads occur only where marketing consent
                  was given at capture time.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* International Transfers */}
          <Card className="glass shadow-elegant">
            <CardHeader>
              <CardTitle>5D. International Data Transfers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-muted-foreground">
              <p className="leading-relaxed">
                Some recipients above (Anthropic, Google, HubSpot, Cloudflare) process data in the
                United States. Where personal data is transferred outside the EU/EEA, we rely on the
                European Commission's Standard Contractual Clauses (Art. 46 GDPR) and, where applicable,
                the recipient's certification under the EU–US Data Privacy Framework, together with
                supplementary measures such as pseudonymisation (hashing) and data minimisation.
              </p>
              <p className="text-sm">
                Core analytics infrastructure (Supabase) is hosted in the EU. AI, advertising and
                Cloudflare features that may involve US transfers are optional and enabled by the site
                operator; advertising transfers additionally require the visitor's marketing consent.
              </p>
            </CardContent>
          </Card>

          {/* Cookies */}
          <Card className="glass shadow-elegant">
            <CardHeader>
              <CardTitle>6. Cookies &amp; Local Storage We Use</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2">Necessary (Always active)</h4>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• <code>site_cookie_consent</code> (localStorage) - Saves your consent choices (Lifetime: 12 months; you are then asked again)</li>
                  <li>• <code>site_consent</code> (cookie) - Mirror of your consent choices (Lifetime: 12 months)</li>
                  <li>• <code>_ciq_adp</code> (sessionStorage) - Page-depth counter, written only for clients classified as automated (Lifetime: tab session)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Analytical (Requires analytics consent, Full mode only)</h4>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• <code>cortiq_session_id</code> (sessionStorage) - Per-session identifier (Lifetime: tab session). In Cookieless mode it is held in memory only.</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Marketing (Requires marketing consent, Full mode only)</h4>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• <code>cortiq_click_ids</code> (sessionStorage) - Ad click IDs (Lifetime: tab session)</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                The items above are the only client-side storage CortIQ uses. Apart from the consent-choice
                mirror, CortIQ sets no cookies. Analytical and marketing storage is written only after the
                corresponding consent.
              </p>
            </CardContent>
          </Card>

          {/* User Rights */}
          <Card className="glass shadow-elegant">
            <CardHeader>
              <CardTitle>7. Your Rights Under GDPR</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">You have the following rights:</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>✓ <strong>Right of access</strong> (Art. 15 GDPR) - Request a copy of your data</li>
                <li>✓ <strong>Right to erasure</strong> (Art. 17 GDPR) - Request deletion of your data</li>
                <li>✓ <strong>Right to rectification</strong> (Art. 16 GDPR) - Correct inaccurate data</li>
                <li>✓ <strong>Right to object</strong> (Art. 21 GDPR) - Object to processing based on legitimate interest (section 3)</li>
                <li>✓ <strong>Right to data portability</strong> (Art. 20 GDPR) - Get your data in structured form</li>
                <li>✓ <strong>Right to withdraw consent</strong> (Art. 7.3 GDPR) - At any time, via the site's cookie settings</li>
              </ul>
              <div className="bg-muted/50 p-4 rounded-lg mt-4">
                <p className="text-sm text-muted-foreground mb-2">
                  <strong className="text-foreground">How to exercise your rights:</strong>
                </p>
                <ol className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>1. Send an email to: privacy@cortiq.se</li>
                  <li>2. Include: Your name, email, and which right you want to exercise</li>
                  <li>3. We will respond within 30 days</li>
                </ol>
                <p className="text-sm text-muted-foreground mt-2">
                  You also have the right to lodge a complaint with a supervisory authority, in Sweden
                  Integritetsskyddsmyndigheten (IMY).
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Security */}
          <Card className="glass shadow-elegant">
            <CardHeader>
              <CardTitle>8. Data Security</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">We use the following security measures:</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>🔒 <strong>Encryption:</strong> All data is transferred via HTTPS/TLS</li>
                <li>🔒 <strong>IP truncation:</strong> IP addresses are truncated before storage</li>
                <li>🔒 <strong>Access control:</strong> Only authorized personnel have access; row-level security isolates each customer's data</li>
                <li>🔒 <strong>Supabase:</strong> Data storage in the EU</li>
              </ul>
            </CardContent>
          </Card>

          {/* Data Retention */}
          <Card className="glass shadow-elegant">
            <CardHeader>
              <CardTitle>9. Data Retention &amp; Automatic Deletion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-primary/5 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 text-foreground">📋 Server &amp; Edge Logs</h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <strong>Access logs (HTTP logs):</strong> 7-30 days</li>
                  <li>• <strong>Security logs (bot detection, DDoS):</strong> 90 days</li>
                  <li>• <strong>Error logs (debugging):</strong> 30 days</li>
                  <li>• <strong>IP addresses:</strong> Truncated (/24) before storage; full IP addresses are not stored</li>
                </ul>
              </div>

              <div className="bg-primary/5 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 text-foreground">📊 Visitor Analytics (with consent)</h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <strong>Event-level analytics data:</strong> per the site operator's configured retention period (default 365 days)</li>
                  <li>• <strong>Aggregated statistics (dashboards):</strong> 24 months</li>
                </ul>
              </div>

              <div className="bg-primary/5 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 text-foreground">🔒 Legal Records</h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <strong>Consent records (proof of consent):</strong> 2 years, to demonstrate consent under GDPR Art. 7.1. This is separate from how long a consent choice is valid: a consent choice expires after 12 months, after which you are asked again.</li>
                  <li>• <strong>Security incidents:</strong> 3 years</li>
                </ul>
              </div>

              <p className="text-sm text-muted-foreground mt-4">
                <strong className="text-foreground">Automatic deletion:</strong> Data is automatically deleted after these periods.
                You can request earlier deletion at any time by contacting privacy@cortiq.se.
              </p>
            </CardContent>
          </Card>

          {/* Techniques Not Used Without Consent */}
          <Card className="glass shadow-elegant border-destructive/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Shield className="h-6 w-6 text-destructive" />
                <CardTitle>10. Techniques We Do Not Use Without Consent</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                Without consent, CortIQ does <strong>not</strong> use:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>❌ <strong>Analytics or advertising cookies</strong> (CortIQ does not set Google Analytics or Facebook Pixel cookies such as _ga or _fbp)</li>
                <li>❌ <strong>Visitor analytics of any kind</strong> (page views, sessions, clicks, scroll depth, heatmaps)</li>
                <li>❌ <strong>Device fingerprinting for identification</strong> (Canvas, WebGL, font detection)</li>
                <li>❌ <strong>Hash-based tracking</strong> (e.g. IP + User-Agent hash)</li>
                <li>❌ <strong>Advertising click IDs</strong> (gclid, fbclid, etc.)</li>
              </ul>
              <div className="bg-destructive/5 p-4 rounded-lg mt-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Note:</strong> Cookieless operation does not remove the need
                  for consent. Under the ePrivacy Directive, reading or storing information on a device for analytics
                  requires consent regardless of whether cookies are used or the script runs on the site's own domain.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card className="glass shadow-elegant border-primary/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Mail className="h-6 w-6 text-primary" />
                <CardTitle>11. Contact Us</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-muted-foreground">
                <p><strong>Email:</strong> privacy@cortiq.se</p>
                <p><strong>Support:</strong> support@cortiq.se</p>
              </div>
              <Link to="/auth">
                <Button className="bg-gradient-primary hover-scale hover-glow">
                  Start Using the Platform
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Comparison */}
          <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="text-center">Quick Guide: What Runs When?</CardTitle>
              <CardDescription className="text-center">Summary only — sections 3 to 5D are authoritative.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-background/80 p-6 rounded-lg">
                  <h4 className="font-bold mb-3">Without consent</h4>
                  <p className="text-sm text-muted-foreground mb-3">Security layer + logs</p>
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li>• AI bot &amp; agent detection</li>
                    <li>• Crawler classification</li>
                    <li>• Bot probe, honeypot, canary</li>
                    <li>• Server &amp; edge logs (operations, security)</li>
                    <li className="font-semibold text-foreground">No visitor analytics, no cookies</li>
                    <li className="font-semibold text-foreground">Basis: legitimate interest (Art. 6.1.f), our assessment</li>
                  </ul>
                </div>
                <div className="bg-background/80 p-6 rounded-lg">
                  <h4 className="font-bold mb-3">Analytics consent</h4>
                  <p className="text-sm text-muted-foreground mb-3">Cookieless or Full mode</p>
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li>• Page views, pages, referrers, AI referrals</li>
                    <li>• Sessions</li>
                    <li>• Clicks, scroll depth, heatmaps</li>
                    <li>• Forms, e-commerce, conversions</li>
                    <li>• Session recording (if enabled)</li>
                    <li className="font-semibold text-foreground">Basis: consent (Art. 6.1.a)</li>
                  </ul>
                </div>
                <div className="bg-background/80 p-6 rounded-lg">
                  <h4 className="font-bold mb-3">Marketing consent</h4>
                  <p className="text-sm text-muted-foreground mb-3">Full mode only</p>
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li>• Ad click IDs (gclid etc.)</li>
                    <li>• Conversion feedback to ad platforms</li>
                    <li className="font-semibold text-foreground">Basis: consent (Art. 6.1.a)</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Back to home */}
        <div className="text-center mt-16">
          <Link to="/">
            <Button variant="outline" size="lg" className="glass">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
