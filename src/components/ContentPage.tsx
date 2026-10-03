import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Info, AlertTriangle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PublicNavigation from "@/components/PublicNavigation";
import PublicFooter from "@/components/PublicFooter";
import { useSEO } from "@/hooks/useSEO";
import { seoFor, SITE_ORIGIN } from "@/marketing-routes";
import type { Block, ContentPageData } from "@/content/types";

// Renders `[label](href)` as links, `code` spans and **bold**; everything else is plain text.
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[4] !== undefined) {
      out.push(<strong key={m.index} className="text-foreground font-semibold">{m[4]}</strong>);
    } else if (m[3] !== undefined) {
      out.push(<code key={m.index} className="px-1.5 py-0.5 rounded bg-muted font-mono text-[0.9em]">{m[3]}</code>);
    } else if (m[2].startsWith("/")) {
      out.push(<Link key={m.index} to={m[2]} className="text-primary underline underline-offset-4">{m[1]}</Link>);
    } else {
      out.push(<a key={m.index} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{m[1]}</a>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderBlock(block: Block, i: number) {
  switch (block.type) {
    case "p":
      return <p key={i} className="text-muted-foreground leading-relaxed">{inline(block.text)}</p>;
    case "list":
      return (
        <ul key={i} className="list-disc pl-6 space-y-2 text-muted-foreground">
          {block.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
        </ul>
      );
    case "steps":
      return (
        <ol key={i} className="list-decimal pl-6 space-y-2 text-muted-foreground">
          {block.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
        </ol>
      );
    case "code":
      return (
        <pre key={i} className="rounded-lg bg-muted p-4 overflow-x-auto text-sm font-mono">
          <code>{block.code}</code>
        </pre>
      );
    case "note": {
      const warning = block.tone === "warning";
      const Icon = warning ? AlertTriangle : Info;
      return (
        <div key={i} className={`flex gap-3 rounded-lg border p-4 text-sm ${warning ? "border-amber-500/40 bg-amber-500/5" : "border-primary/30 bg-primary/5"}`}>
          <Icon className={`h-5 w-5 flex-shrink-0 ${warning ? "text-amber-500" : "text-primary"}`} />
          <p className="leading-relaxed">{inline(block.text)}</p>
        </div>
      );
    }
  }
}

export default function ContentPage({ page }: { page: ContentPageData }) {
  useSEO(seoFor(page.path));

  const crumbs = [{ label: "Home", path: "/" }, ...page.breadcrumb];
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: SITE_ORIGIN + c.path })),
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            {crumbs.map((c, i) => (
              <Fragment key={c.path}>
                {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
                <li>
                  {i === crumbs.length - 1 ? (
                    <span aria-current="page" className="text-foreground">{c.label}</span>
                  ) : (
                    <Link to={c.path} className="hover:text-primary">{c.label}</Link>
                  )}
                </li>
              </Fragment>
            ))}
          </ol>
        </nav>

        <header className="mb-12 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="secondary">{page.eyebrow}</Badge>
            {page.status && <Badge variant="outline">{page.status}</Badge>}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{page.h1}</h1>
          <p className="text-xl text-muted-foreground leading-relaxed">{inline(page.lead)}</p>
        </header>

        <div className="grid lg:grid-cols-[1fr_220px] gap-12">
          <article className="space-y-12 min-w-0">
            {page.sections.map((s) => (
              <section key={s.id} id={s.id} className="space-y-4 scroll-mt-24">
                <h2 className="text-2xl font-bold">{s.heading}</h2>
                {s.blocks.map(renderBlock)}
              </section>
            ))}

            {page.related && page.related.length > 0 && (
              <section className="border-t pt-8">
                <h2 className="text-lg font-semibold mb-4">Related</h2>
                <ul className="grid sm:grid-cols-2 gap-2">
                  {page.related.map((r) => (
                    <li key={r.path}>
                      <Link to={r.path} className="inline-flex items-center gap-1 text-primary hover:underline">
                        {r.label} <ArrowRight className="h-4 w-4" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="rounded-lg bg-primary/5 p-8 text-center">
              <h2 className="text-2xl font-bold mb-3">Try it on your own site</h2>
              <p className="text-muted-foreground mb-6">CortIQ is free during the beta.</p>
              <Button asChild size="lg">
                <Link to="/auth">Create free account <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </article>

          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-24 text-sm">
              <p className="font-semibold mb-3">On this page</p>
              <ul className="space-y-2 text-muted-foreground">
                {page.sections.map((s) => (
                  <li key={s.id}><a href={`#${s.id}`} className="hover:text-primary">{s.heading}</a></li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
