export const SectionHeader = ({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) => (
  <div className="max-w-3xl mx-auto text-center mb-12">
    <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-3">{eyebrow}</p>
    <h2 className="text-3xl md:text-4xl font-bold mb-4">{title}</h2>
    <p className="text-lg text-muted-foreground leading-relaxed">{intro}</p>
  </div>
);
