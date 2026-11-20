import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, Menu, ChevronDown, Github } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type NavLink = { to: string; label: string; note?: string };
type NavItem = { label: string; to: string; children?: NavLink[] };

// One row on desktop: five items, three of them menus. Child links stay in the prerendered HTML
// (menus are hidden with CSS, not unmounted) so crawlers still find them.
const NAV: NavItem[] = [
  {
    label: "Features",
    to: "/features/",
    children: [
      { to: "/features/", label: "All features" },
      { to: "/features/ai/", label: "AI Agent Analytics" },
      { to: "/features/analytics/", label: "Analytics & Heatmaps" },
      { to: "/features/cyber/", label: "Cyber & Bot Security" },
      { to: "/cmp/", label: "CMP Solution" },
    ],
  },
  {
    label: "Tools",
    to: "/tracking-check/",
    children: [
      { to: "/tracking-check/", label: "Tracking Check", note: "What your site sends, before and after consent" },
      { to: "/gtm-audit/", label: "GTM Audit", note: "Audit a GTM export in your browser" },
    ],
  },
  {
    label: "Docs",
    to: "/docs/",
    children: [
      { to: "/docs/", label: "Documentation" },
      { to: "/integrations/", label: "Integrations" },
    ],
  },
  { label: "Pricing", to: "/pricing/" },
  { label: "Contact", to: "/contact/" },
];

const isActive = (item: NavItem, path: string) =>
  path === item.to || (item.children ?? []).some((c) => path === c.to);

export default function PublicNavigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const location = useLocation();

  // Mount the radix Sheet only client-side. Its internal useLayoutEffect produced
  // server/client differences that threw hydration errors (#418/#423) during prerender;
  // rendering a plain button until mounted keeps SSR and the first client render identical.
  useEffect(() => { setMounted(true); }, []);

  return (
    <nav className="glass border-b border-border/20 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="CortIQ home">
          <BarChart3 className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-gradient-primary">CortIQ</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden lg:flex items-center gap-1 whitespace-nowrap">
          {NAV.map((item) => {
            const active = isActive(item, location.pathname);
            const itemClass = `flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active ? "text-primary" : "text-foreground hover:text-primary"
            }`;
            if (!item.children) {
              return <Link key={item.label} to={item.to} className={itemClass}>{item.label}</Link>;
            }
            const open = openMenu === item.label;
            return (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => setOpenMenu(item.label)}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <button
                  type="button"
                  className={itemClass}
                  aria-expanded={open}
                  onClick={() => setOpenMenu(open ? null : item.label)}
                >
                  {item.label} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {/* Always rendered (hidden via CSS) so the links exist in the prerendered HTML for crawlers. */}
                <div className={`${open ? "block" : "hidden"} absolute top-full left-0 pt-1 z-50`}>
                  <div className="min-w-56 rounded-lg border border-border bg-background shadow-lg py-1">
                    {item.children.map((link) => (
                      <Link
                        key={link.to + link.label}
                        to={link.to}
                        onClick={() => setOpenMenu(null)}
                        className="block px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
                      >
                        <span className={location.pathname === link.to ? "text-primary" : "text-foreground"}>{link.label}</span>
                        {link.note && <span className="block text-xs text-muted-foreground whitespace-normal">{link.note}</span>}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Actions */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <a
            href="https://github.com/ExpandTalk-Corporation/Cortiq"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-primary transition-colors"
          >
            <Github className="h-5 w-5" />
          </a>
          <ThemeToggle />
          <Link to="/auth">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link to="/auth">
            <Button size="sm" className="bg-gradient-primary">Request invitation</Button>
          </Link>
        </div>

        {/* Mobile Menu */}
        <div className="flex lg:hidden items-center space-x-2">
          <ThemeToggle />
          {mounted ? (
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col space-y-6 mt-8">
                <div className="flex items-center space-x-3 mb-4">
                  <BarChart3 className="h-8 w-8 text-primary" />
                  <span className="text-xl font-bold text-gradient-primary">CortIQ</span>
                </div>

                <nav className="flex flex-col space-y-1">
                  {NAV.map((item) => item.children ? (
                    <div key={item.label} className="py-2">
                      <p className="text-lg font-medium text-foreground mb-1">{item.label}</p>
                      <div className="pl-4 flex flex-col space-y-1">
                        {item.children.map((link) => (
                          <Link
                            key={link.to + link.label}
                            to={link.to}
                            className="text-sm text-foreground hover:text-primary transition-colors py-1"
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Link
                      key={item.label}
                      to={item.to}
                      className="text-lg font-medium text-foreground hover:text-primary transition-colors py-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                <div className="flex flex-col space-y-3 pt-6 border-t">
                  <a
                    href="https://github.com/ExpandTalk-Corporation/Cortiq"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-2 text-foreground hover:text-primary transition-colors py-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Github className="h-5 w-5" />
                    <span className="font-medium">GitHub</span>
                  </a>
                  <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full">Log in</Button>
                  </Link>
                  <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full bg-gradient-primary">Request invitation</Button>
                  </Link>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          ) : (
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
