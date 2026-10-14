import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import PublicNavigation from "@/components/PublicNavigation";
import PublicFooter from "@/components/PublicFooter";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";
import { Shield, CheckCircle, Mail, FileText, Database, Users, BarChart3, Megaphone } from "lucide-react";

const LAST_UPDATED = "October 14, 2026";

const Privacy = () => {
  useSEO(seoFor("/privacy/"));
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
                <li>• <strong>Server-side, without device access</strong> — AI-agent and bot measurement and server/edge logs (section 3).</li>
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
                <p><strong>Registered office:</strong> Göteborg, Sweden</p>
                <p><strong>VAT number:</strong> SE559358882401</p>
                <p><strong>Registered address:</strong> Parmmätaregatan 4B, 417 04 Göteborg, Sweden</p>
                <p><strong>Email:</strong> info@expandtalk.se</p>
                <p className="text-sm mt-3">
                  For analytics data collected on our customers' websites, CortIQ acts as a
                  <strong> processor</strong> on behalf of the site operator (the controller). For our own
                  account, billing and platform data, CortIQ (Expandtalk Corporation AB) is the
                  <strong> controller</strong>.
                </p>
                <p className="text-sm mt-3">
                  <strong className="text-foreground">Visiting a website that uses CortIQ?</strong> The owner of that
                  website is the controller for the data collected about you there. Contact the website owner to
                  exercise your rights. If you contact us instead, we will forward your request to the website owner
                  and help them respond.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Server-Side Agent Measurement */}
          <Card className="glass shadow-elegant border-primary/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Shield className="h-6 w-6 text-primary" />
                <CardTitle>3A. Server-Side AI-Agent &amp; Bot Measurement (No device access)</CardTitle>
              </div>
              <Badge className="w-fit bg-gradient-accent text-white">Server-side</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                AI crawlers and agents are measured on the site operator&apos;s own server or edge (for example a
                Next.js, Netlify or Cloudflare function, Node middleware or the WordPress plugin), from the HTTP request
                the server already receives:
              </p>
              <ul className="space-y-3">
                {[
                  'Requests whose User-Agent matches a known crawler or bot, classified as training, agentic or citation traffic',
                  'Fetches of robots.txt and llms.txt',
                  'Requests to a hidden honeypot link in the server-rendered HTML, which is not visible to human visitors and is normally followed only by automated clients',
                  'Ordinary human requests are filtered out on the operator\'s server and never sent to CortIQ'
                ].map((item, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="bg-primary/5 p-4 rounded-lg mt-4">
                <ul className="text-sm text-muted-foreground space-y-2 ml-4">
                  <li>• Data per request: timestamp, URL path, referrer, User-Agent and the IP address truncated to /24 (IPv4) or /48 (IPv6) on the operator&apos;s server before it is sent. The truncated IP is cleared after 30 days.</li>
                  <li>• Nothing is stored on or read from the visitor&apos;s device.</li>
                  <li>• Used for crawler and AI-agent measurement and site protection — not for advertising or visitor profiling.</li>
                  <li>• The CortIQ script&apos;s in-browser bot checks (bot probe, honeypot, canary) are different: they read device properties, so they run only after analytics consent (section 5).</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  <strong className="text-foreground">Legal basis:</strong> the site operator, as controller, decides
                  the legal basis; typically this is legitimate interest (GDPR Art. 6(1)(f)) in understanding, managing
                  and protecting against automated traffic. Because the measurement only uses the HTTP request and does
                  not store or read information on the visitor&apos;s device, our assessment is that it is not covered by
                  the consent requirement in ePrivacy Directive Art. 5(3) (Swedish LEK chapter 9, section 28). The
                  request data is still personal data under the GDPR, and you may object to the processing (Art. 21
                  GDPR). This is our interpretation; supervisory authorities may take a different view.
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
                <p className="text-sm text-muted-foreground mb-2">
                  For requests classified as automated (crawlers, AI bots, scrapers, monitoring) CortIQ stores:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <strong>Timestamp</strong> of the request</li>
                  <li>• <strong>HTTP method and URL path</strong> without query string (e.g. GET /products/product-123)</li>
                  <li>• <strong>HTTP status code</strong> (200, 404, 500)</li>
                  <li>• <strong>User-Agent</strong> (used for crawler and bot classification)</li>
                  <li>• <strong>Referrer</strong></li>
                  <li>• <strong>Country</strong>, derived from the IP address</li>
                  <li>• <strong>Truncated IP address</strong> — truncated to /24 (IPv4) or /48 (IPv6) before CortIQ stores it; the full IP address is not stored</li>
                  <li>• <strong>Request identifier</strong> (e.g. Cloudflare Ray ID) and load time</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-2">
                  CortIQ&apos;s server adapters send only bot-like requests (section 3A). With the Cloudflare log
                  integration, for requests that look human or cannot be classified, CortIQ keeps only an anonymous count:
                  timestamp, method, status code, country and whether it was a file request. No user agent,
                  referrer, IP subnet, request identifier or URL is stored for those requests.
                </p>
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
                  <strong className="text-foreground">Retention:</strong> we keep account data for as long as your
                  account exists. When you close your account, it is deleted within 30 days, unless the law requires
                  us to keep it longer.
                </p>
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
                  'AI referrals — when a visit arrives from an AI service such as ChatGPT or Perplexity (referring site, landing page with UTM parameters only, device type, time on page)',
                  'Referrers and traffic sources (including UTM parameters)',
                  'Sessions, device type, browser and country',
                  'Clicks and link clicks',
                  'Scroll depth and heatmaps',
                  'Form interactions (field content is not captured) and form submissions',
                  'E-commerce events and conversions',
                  'In-browser bot checks — bot probe (device capability signals, sent only for clients that look automated), honeypot and canary links'
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
                <li>• Conversion feedback to advertising platforms (e.g. Google Ads Enhanced Conversions), using a SHA-256 hash of an email address submitted in a form together with the click ID (section 5B). The tracking script hashes the email in the browser; the plain email is not sent to CortIQ.</li>
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

          {/* Third-Party Recipients */}
          <Card className="glass shadow-elegant border-accent/20">
            <CardHeader>
              <div className="flex items-center space-x-3 mb-2">
                <Users className="h-6 w-6 text-accent" />
                <CardTitle>5B. Third-Party Recipients &amp; Processors</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                Our processors (sub-processors, when we act for a site operator). The authoritative list is section 6
                of our{" "}
                <a href="https://github.com/ExpandTalk-Corporation/Cortiq/blob/main/DPA.md" className="text-primary underline" target="_blank" rel="noopener noreferrer">Data Processing Agreement</a>:
              </p>
              <ul className="space-y-3 text-muted-foreground text-sm ml-4">
                <li>• <strong>Supabase</strong> (Supabase, Inc., USA) — database, authentication and server functions for all data. Data is stored on AWS in Stockholm (EU).</li>
                <li>• <strong>Loopia</strong> (Loopia AB, Sweden) — web host for cortiq.se, which serves the dashboard and the tracking script file. When a browser loads the script, Loopia&apos;s access log records the IP address, user agent, file and time. This is needed to deliver the file (the transmission exception in Chapter 9, Section 28 of the Electronic Communications Act); our legal basis for the log is legitimate interest in running and securing the service (Art. 6(1)(f) GDPR), and it is not used for analytics.</li>
                <li>• <strong>Resend</strong> (Plus Five Five, Inc., USA) — email delivery of large report exports (over 10,000 rows); Resend receives the recipient address and a download link that expires after one hour, not the report itself.</li>
                <li>• <strong>Cloudflare</strong> (Cloudflare, Inc., USA) — when the operator enables the Cloudflare integration, Cloudflare processes visitor IP addresses at its edge; CortIQ receives the country and a truncated IP address for security and bot classification (section 3B).</li>
                <li>• <strong>Anthropic</strong> (USA) — AI insights on the dashboard use CortIQ&apos;s own key and receive aggregated statistics for a site (page paths without query strings, counts, device breakdown, form conversion rates, monthly KPI figures). No visitor identifiers, IP addresses or email addresses are sent.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                Services that a site operator connects with its own account. These providers act under the
                operator&apos;s own agreement with them:
              </p>
              <ul className="space-y-3 text-muted-foreground text-sm ml-4">
                <li>• <strong>Anthropic</strong> (AI assistant &amp; GEO analysis, USA) — when the operator uses AI features with their own Anthropic API key, relevant analytics results are sent to the Claude API on the operator&apos;s instruction.</li>
                <li>• <strong>Google Ads</strong> (Enhanced Conversions for Leads, USA) — when the operator enables conversion feedback and marketing consent was given, a SHA-256 hash of the email plus the ad click ID (gclid) and conversion value are uploaded to the operator&apos;s Google Ads account.</li>
                <li>• <strong>HubSpot</strong> (CRM lead-quality feedback) — when the operator connects HubSpot, the operator&apos;s HubSpot account sends CortIQ a contact&apos;s email address and lead status when the status changes. CortIQ hashes the email immediately on receipt and never stores it in plain text. The hash and lead status are kept only if they match a conversion recorded with marketing consent; otherwise they are discarded.</li>
                <li>• <strong>Google Analytics and Search Console</strong> — when the operator connects its own property, CortIQ reads reports from it and can send conversion events to it.</li>
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
              <CardTitle>5C. International Data Transfers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-muted-foreground">
              <p className="leading-relaxed">
                Analytics data is stored in the EU. The basis for transfers outside the EU/EEA, per processor:
              </p>
              <ul className="text-sm space-y-2 ml-4">
                <li>• <strong>Supabase</strong> — data is stored in Stockholm, but Supabase is a US company and may access it from outside the EEA. Such transfers rely on the European Commission&apos;s Standard Contractual Clauses (Art. 46 GDPR) in Supabase&apos;s data processing agreement.</li>
                <li>• <strong>Loopia</strong> — Sweden; no transfer.</li>
                <li>• <strong>Resend</strong> — USA; the EU–US Data Privacy Framework (Art. 45 GDPR), with Standard Contractual Clauses in Resend&apos;s data processing agreement.</li>
                <li>• <strong>Anthropic</strong> — USA; Standard Contractual Clauses (Art. 46 GDPR) in Anthropic&apos;s data processing addendum. Only aggregated statistics are sent.</li>
                <li>• <strong>Cloudflare</strong> — the EU–US Data Privacy Framework (Art. 45 GDPR), with Standard Contractual Clauses in Cloudflare&apos;s data processing agreement.</li>
                <li>• <strong>Services the operator connects</strong> (Anthropic, Google, HubSpot) — the transfer basis follows the operator&apos;s own agreement with each provider.</li>
              </ul>
              <p className="text-sm">
                We also limit what is transferred, for example by hashing email addresses and truncating IP
                addresses. AI, advertising and Cloudflare features are optional and enabled by the site
                operator; advertising transfers additionally require the visitor&apos;s marketing consent.
              </p>
            </CardContent>
          </Card>

          {/* Cookies */}
          <Card className="glass shadow-elegant">
            <CardHeader>
              <CardTitle>6. Cookies &amp; Browser Storage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2">A. On websites that use CortIQ</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  The CortIQ tracking script and the CortIQ consent banner use the following. If the site operator
                  uses a different consent tool, that tool's own storage applies instead of the consent items.
                </p>
                <h5 className="font-semibold text-sm mb-1">Necessary (always active)</h5>
                <ul className="text-muted-foreground space-y-1 ml-4 mb-3">
                  <li>• <code>site_cookie_consent</code> (localStorage) - Your consent choices, read by the tracking script before anything is measured (Lifetime: 12 months; you are then asked again)</li>
                  <li>• <code>site_consent</code> (cookie) - Mirror of your consent choices, set by the consent banner (Lifetime: 12 months)</li>
                  <li>• <code>user_consent</code> (sessionStorage) - Copy of your consent choices for the current tab, set by the consent banner (Lifetime: tab session)</li>
                  <li>• <code>_ciq_adp</code> (sessionStorage) - Page-depth counter, written only for clients classified as automated (Lifetime: tab session)</li>
                </ul>
                <h5 className="font-semibold text-sm mb-1">Analytical (requires analytics consent, Full mode only)</h5>
                <ul className="text-muted-foreground space-y-1 ml-4 mb-3">
                  <li>• <code>cortiq_session_id</code> (sessionStorage) - Per-session identifier (Lifetime: tab session). In Cookieless mode it is held in memory only and nothing is written.</li>
                </ul>
                <h5 className="font-semibold text-sm mb-1">Marketing (requires marketing consent, Full mode only)</h5>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• <code>cortiq_click_ids</code> (sessionStorage) - Ad click IDs from the landing URL (Lifetime: tab session)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">B. On cortiq.se</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Our own website does not load Google Analytics, advertising pixels or the CortIQ tracking
                  script. It sets only:
                </p>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• <code>site_cookie_consent</code> (localStorage), <code>site_consent</code> (cookie) and <code>user_consent</code> (sessionStorage) - Your consent choices, as above</li>
                  <li>• <code>theme</code> (localStorage) - Light/dark theme, only if you switch theme</li>
                  <li>• <code>sb-…-auth-token</code> (localStorage) - Login session for the dashboard, only when you log in</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                The CortIQ tracking script sets no cookies, in either mode. In Full mode it keeps a session
                identifier in sessionStorage; in Cookieless mode it writes nothing. The only cookie in CortIQ&apos;s
                products is the consent-choice mirror <code>site_consent</code>, set by the CortIQ consent banner.
                Analytical and marketing storage is written only after the corresponding consent. Withdrawing consent removes
                <code> cortiq_session_id</code> and <code>cortiq_click_ids</code>.
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
                <li>✓ <strong>Right to restriction of processing</strong> (Art. 18 GDPR) - Ask us to limit how we use your data, for example while we check a disputed fact</li>
                <li>✓ <strong>Right to object</strong> (Art. 21 GDPR) - Object to processing based on legitimate interest (section 3)</li>
                <li>✓ <strong>Right to data portability</strong> (Art. 20 GDPR) - Get your data in structured form</li>
                <li>✓ <strong>Right to withdraw consent</strong> (Art. 7.3 GDPR) - At any time, via the site's cookie settings</li>
              </ul>
              <div className="bg-muted/50 p-4 rounded-lg mt-4">
                <p className="text-sm text-muted-foreground mb-2">
                  <strong className="text-foreground">How to exercise your rights:</strong>
                </p>
                <ol className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>1. Send an email to: info@expandtalk.se</li>
                  <li>2. Include: Your name, email, and which right you want to exercise</li>
                  <li>3. We will respond within one month. For complex or numerous requests, we may extend this by two further months; we will tell you within the first month (Art. 12.3 GDPR)</li>
                </ol>
                <p className="text-sm text-muted-foreground mt-2">
                  If your data was collected on a website that uses CortIQ, the website owner is the controller.
                  Send your request to the website owner; we help them respond (section 2).
                </p>
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
                <h4 className="font-semibold mb-2 text-foreground">Visitor analytics and AI-bot traffic</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  A daily job deletes data older than the site's retention period. One period per site applies to all
                  of the following: page views, sessions, interactions, heatmap data, form analytics, conversion
                  events (including hashed email and click IDs), visitor profiles, AI referral records, AI-bot
                  traffic, and AI agent sessions and journeys.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <strong>Retention period:</strong> the value in the site's GDPR settings (default 365 days)</li>
                  <li>• <strong>Sites without GDPR settings:</strong> 365 days</li>
                  <li>• <strong>Truncated IP on AI-bot records:</strong> cleared after 30 days</li>
                </ul>
              </div>

              <div className="bg-primary/5 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 text-foreground">Server logs and bot detection</h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <strong>Server-log (Cloudflare) records:</strong> 90 days, or the site's retention period if shorter</li>
                  <li>• <strong>Bot detection records:</strong> 365 days</li>
                  <li>• <strong>Hourly bot statistics (aggregated):</strong> 365 days</li>
                </ul>
              </div>

              <div className="bg-primary/5 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 text-foreground">Consent and data-subject requests</h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <strong>Consent records (proof of consent):</strong> 2 years, to demonstrate consent under GDPR Art. 7.1. This is separate from how long a consent choice is valid: a consent choice expires after 12 months, after which you are asked again.</li>
                  <li>• <strong>Data-subject requests:</strong> 3 years, or 1 year after a request is completed</li>
                </ul>
              </div>

              <div className="bg-primary/5 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 text-foreground">Hosting providers</h4>
                <p className="text-sm text-muted-foreground">
                  Request logs held by our hosting providers (Supabase, Loopia and, where enabled, Cloudflare) follow
                  those providers' own log retention. Deleting a site from CortIQ deletes all of its data immediately.
                </p>
              </div>

              <p className="text-sm text-muted-foreground mt-4">
                You can request earlier deletion at any time by contacting info@expandtalk.se.
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
                <p><strong>Email:</strong> info@expandtalk.se</p>
                <p><strong>Support:</strong> info@expandtalk.se</p>
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
              <CardDescription className="text-center">Summary only — sections 3 to 5C are authoritative.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-background/80 p-6 rounded-lg">
                  <h4 className="font-bold mb-3">Server-side</h4>
                  <p className="text-sm text-muted-foreground mb-3">No device access; in our assessment not subject to cookie consent</p>
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li>• AI crawler &amp; agent measurement</li>
                    <li>• Crawler classification</li>
                    <li>• robots.txt, llms.txt and honeypot hits</li>
                    <li>• Server &amp; edge logs (operations, security)</li>
                    <li className="font-semibold text-foreground">Nothing runs in the browser, no cookies</li>
                    <li className="font-semibold text-foreground">Basis: set by the site operator, typically legitimate interest (Art. 6(1)(f)); right to object applies</li>
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
      <PublicFooter />
    </div>
  );
};

export default Privacy;
