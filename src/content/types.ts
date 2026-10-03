// Content model for documentation and integration pages. Pages are plain data
// rendered by src/components/ContentPage.tsx, so copy can be reviewed (and
// guarded by tests) without wading through layout code.
//
// Inline text supports two markers: [label](/path/) for links and `code`.

export type Block =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'code'; code: string; lang?: string }
  | { type: 'note'; tone?: 'info' | 'warning'; text: string };

export interface Section {
  /** Anchor id, also used for the on-page table of contents. */
  id: string;
  heading: string;
  blocks: Block[];
}

export interface ContentPageData {
  /** Registry path, e.g. '/integrations/wordpress/'. */
  path: string;
  breadcrumb: { label: string; path: string }[];
  eyebrow: string;
  h1: string;
  lead: string;
  /** Honest maturity label shown next to the heading, e.g. 'Beta'. */
  status?: string;
  sections: Section[];
  related?: { label: string; path: string }[];
}
