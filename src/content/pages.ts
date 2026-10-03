import type { ContentPageData } from './types';
import { DOCS_PAGES } from './docs';
import { COMPANY_PAGES } from './company';
import { TERMS } from './legal';

// Every page rendered by ContentPage. Each must also be registered in src/marketing-routes.ts.
export const CONTENT_PAGES: ContentPageData[] = [...DOCS_PAGES, ...COMPANY_PAGES, TERMS];
