import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, Menu, ChevronDown, Github } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const FEATURES_LINKS = [
  { to: "/features/ai/", label: "AI Agent Analytics" },
  { to: "/features/analytics/", label: "Analytics & Heatmaps" },
  { to: "/features/cyber/", label: "Cyber & Bot Security" },
  { to: "/cmp/", label: "CMP Solution" },
];

const TOP_NAV = [
  { to: "/integrations/", label: "Integrations" },
  { to: "/docs/", label: "Docs" },
  { to: "/pricing/", label: "Pricing" },
  { to: "/contact/", label: "Contact" },
];

export default function PublicNavigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const location = useLocation();

  // Mount the radix Sheet only client-side. Its internal useLayoutEffect produced
  // server/client differences that threw hydration errors (#418/#423) during prerender;
  // rendering a plain button until mounted keeps SSR and the first client render identical.
  useEffect(() => { setMounted(true); }, []);

  return (
    <nav className="glass border-b border-border/20 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Link to="/" className="flex items-center space-x-3">
          <div className="relative">
            <BarChart3 className="h-10 w-10 text-primary animate-pulse-glow" />
            <div className="absolute inset-0 h-10 w-10 text-primary opacity-30 animate-ping"></div>
          </div>
          <span className="text-2xl font-bold text-gradient-primary">CortIQ</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-8">
          <Link to="/" className="text-foreground hover:text-primary transition-colors font-medium">
            Home
          </Link>

          {/* Features dropdown */}
          <div
            className="relative"
            onMouseEnter={() => setFeaturesOpen(true)}
            onMouseLeave={() => setFeaturesOpen(false)}
          >
            <button className="flex items-center gap-1 text-foreground hover:text-primary transition-colors font-medium">
              Features <ChevronDown className="h-4 w-4" />
            </button>
            {/* Always rendered (hidden via CSS) so the links exist in the prerendered HTML for crawlers. */}
            <div className={`${featuresOpen ? "block" : "hidden"} absolute top-full left-0 mt-1 w-52 rounded-lg border border-border bg-background shadow-lg py-1 z-50`}>
              <Link
                to="/features/"
                className="block px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors font-medium"
              >
                All Features
              </Link>
              <div className="my-1 border-t border-border/50" />
              {FEATURES_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="block px-4 py-2 text-sm text-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {TOP_NAV.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`font-medium transition-colors ${
                location.pathname === link.to
                  ? "text-primary"
                  : "text-foreground hover:text-primary"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center space-x-4">
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
            <Button variant="ghost" className="hover-lift">Log in</Button>
          </Link>
          <Link to="/auth">
            <Button className="bg-gradient-primary hover-scale hover-glow">Request Invitation</Button>
          </Link>
        </div>

        {/* Mobile Menu */}
        <div className="flex md:hidden items-center space-x-2">
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
                  <Link
                    to="/"
                    className="text-lg font-medium text-foreground hover:text-primary transition-colors py-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Home
                  </Link>

                  <div className="py-2">
                    <p className="text-lg font-medium text-foreground mb-1">Features</p>
                    <div className="pl-4 flex flex-col space-y-1">
                      <Link
                        to="/features/"
                        className="text-sm text-muted-foreground hover:text-primary transition-colors py-1"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        All Features
                      </Link>
                      {FEATURES_LINKS.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          className="text-sm text-foreground hover:text-primary transition-colors py-1"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </div>

                  {TOP_NAV.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="text-lg font-medium text-foreground hover:text-primary transition-colors py-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.label}
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
                    <Button className="w-full bg-gradient-primary">Request Invitation</Button>
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
