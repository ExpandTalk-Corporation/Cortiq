import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { MARKETING_ROUTES, type FooterGroup } from "@/marketing-routes";
import { useAuth } from "@/hooks/useAuth";

const GROUPS: { id: FooterGroup; heading: string }[] = [
  { id: "product", heading: "Product" },
  { id: "resources", heading: "Resources" },
  { id: "company", heading: "Company" },
];

// Signed-in users are customers, not prospects: links to their account, help and tools.
// Dashboard links use ?tab= values from navSections.ts, which are never renamed.
const SIGNED_IN_GROUPS: { heading: string; links: { to: string; label: string }[] }[] = [
  {
    heading: "Your account",
    links: [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/dashboard?tab=setup", label: "Setup & tracking script" },
      { to: "/dashboard?tab=alerts", label: "Measurement health" },
      { to: "/dashboard?tab=cortiq-api", label: "CortIQ API & MCP" },
    ],
  },
  {
    heading: "Help",
    links: [
      { to: "/docs/", label: "Getting started" },
      { to: "/guides/", label: "Guides" },
      { to: "/api/", label: "API documentation" },
      { to: "/integrations/", label: "Integrations" },
      { to: "/changelog/", label: "Changelog" },
    ],
  },
  {
    heading: "Tools",
    links: [
      { to: "/tracking-check/", label: "Tracking Check" },
      { to: "/gtm-audit/", label: "GTM container audit" },
      { to: "/cookie-consent-checker/", label: "Cookie consent checker" },
      { to: "/markets/", label: "Rule status per market" },
    ],
  },
];

const LEGAL_LINKS = [
  { to: "/contact/", label: "Contact" },
  { to: "/security/", label: "Security" },
  { to: "/privacy/", label: "Privacy" },
  { to: "/terms/", label: "Terms" },
  { to: "/cookies/", label: "Cookies" },
];

function Copyright() {
  return (
    <p className="text-sm text-muted-foreground">
      © {new Date().getFullYear()} Expandtalk Corporation AB · Reg. no. 559358-8824 · Göteborg
    </p>
  );
}

// Plain links to every public page, rendered on every marketing page so crawlers
// reach the whole site from any entry point (the nav dropdown alone is not enough).
// The prerendered HTML is always the signed-out footer: the session is only known after
// mount, so signed-in users switch to the short footer without a hydration mismatch.
export default function PublicFooter() {
  const { user } = useAuth();
  return user ? <SignedInFooter /> : <SignedOutFooter />;
}

function SignedOutFooter() {
  return (
    <footer className="border-t bg-muted/20 py-16 px-4">
      <div className="container mx-auto grid gap-12 md:grid-cols-5">
        <div className="md:col-span-2">
          <Link to="/" className="flex items-center gap-3 mb-4">
            <BarChart3 className="h-8 w-8 text-primary" />
            <span className="font-bold text-xl text-gradient-primary">CortIQ</span>
          </Link>
          <p className="text-muted-foreground leading-relaxed max-w-md">
            AI-agent measurement on your own server; visitor analytics that are consent-first and cookieless.
          </p>
          <div className="mt-4">
            <Copyright />
          </div>
        </div>

        {GROUPS.map((group) => (
          <nav key={group.id} aria-label={group.heading}>
            <h2 className="font-semibold mb-4">{group.heading}</h2>
            <ul className="space-y-2 text-muted-foreground">
              {MARKETING_ROUTES.filter((r) => r.footer?.group === group.id).map((r) => (
                <li key={r.path}>
                  <Link to={r.path} className="hover:text-primary transition-colors">{r.footer!.label}</Link>
                </li>
              ))}
              {group.id === "resources" && (
                <li>
                  <a href="https://github.com/ExpandTalk-Corporation/Cortiq" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                    GitHub
                  </a>
                </li>
              )}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}

function SignedInFooter() {
  return (
    <footer className="border-t bg-muted/20 py-12 px-4">
      <div className="container mx-auto grid gap-10 sm:grid-cols-3">
        {SIGNED_IN_GROUPS.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 className="font-semibold mb-4">{group.heading}</h2>
            <ul className="space-y-2 text-muted-foreground">
              {group.links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-primary transition-colors">{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container mx-auto mt-10 pt-6 border-t flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="hover:text-primary transition-colors">{link.label}</Link>
          ))}
        </nav>
        <Copyright />
      </div>
    </footer>
  );
}
