import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { MARKETING_ROUTES, type FooterGroup } from "@/marketing-routes";

const GROUPS: { id: FooterGroup; heading: string }[] = [
  { id: "product", heading: "Product" },
  { id: "resources", heading: "Resources" },
  { id: "company", heading: "Company" },
];

// Plain links to every public page, rendered on every marketing page so crawlers
// reach the whole site from any entry point (the nav dropdown alone is not enough).
export default function PublicFooter() {
  return (
    <footer className="border-t bg-muted/20 py-16 px-4">
      <div className="container mx-auto grid gap-12 md:grid-cols-5">
        <div className="md:col-span-2">
          <Link to="/" className="flex items-center gap-3 mb-4">
            <BarChart3 className="h-8 w-8 text-primary" />
            <span className="font-bold text-xl text-gradient-primary">CortIQ</span>
          </Link>
          <p className="text-muted-foreground leading-relaxed max-w-md">
            AI-agent intelligence without consent friction; visitor analytics that are consent-first and cookieless.
          </p>
          <p className="text-sm text-muted-foreground mt-4">Built by Expandtalk Corporation AB, Sweden.</p>
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
