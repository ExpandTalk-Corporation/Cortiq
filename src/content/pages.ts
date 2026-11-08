import type { ContentPageData } from './types';
import { DOCS_PAGES } from './docs';
import { COMPANY_PAGES } from './company';
import { TERMS } from './legal';
import { GLOSSARY } from './glossary';
import { GUIDE_PAGES } from './guides';

// Every page rendered by ContentPage. Each must also be registered in src/marketing-routes.ts.
export const CONTENT_PAGES: ContentPageData[] = [...DOCS_PAGES, ...COMPANY_PAGES, GLOSSARY, ...GUIDE_PAGES, TERMS];
