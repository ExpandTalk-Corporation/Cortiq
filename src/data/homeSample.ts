import type { BotCategory } from "@/lib/aiBotRegistry";

// Illustrative numbers for the homepage mockups. Every component that renders them shows
// "Example data". Bot names are resolved from the registry by category + index, never typed here.

export const HERO_DAYS: Record<BotCategory, number>[] = [
  { training: 48, agentic: 10, citation: 20 },
  { training: 52, agentic: 12, citation: 22 },
  { training: 45, agentic: 9, citation: 18 },
  { training: 60, agentic: 14, citation: 25 },
  { training: 55, agentic: 13, citation: 24 },
  { training: 50, agentic: 11, citation: 21 },
  { training: 47, agentic: 8, citation: 19 },
  { training: 58, agentic: 15, citation: 26 },
  { training: 62, agentic: 16, citation: 27 },
  { training: 49, agentic: 12, citation: 22 },
  { training: 53, agentic: 10, citation: 20 },
  { training: 57, agentic: 14, citation: 25 },
  { training: 51, agentic: 13, citation: 23 },
  { training: 46, agentic: 11, citation: 21 },
];

export const HERO_HUMAN_VISITS = 37000;

export const HERO_TOP_BOTS: { category: BotCategory; index: number; visits: number }[] = [
  { category: "training", index: 0, visits: 410 },
  { category: "citation", index: 0, visits: 230 },
  { category: "training", index: 1, visits: 150 },
  { category: "agentic", index: 0, visits: 120 },
];

export const ATTRIBUTION_FLOW = ["Ad click", "Visit", "Form", "HubSpot", "Qualified lead", "Google Ads"];

export const CONVERSION_BARS = [
  { label: "Conversions from consented visits", value: 48 },
  { label: "Qualified in HubSpot", value: 21 },
  { label: "Uploaded to Google Ads", value: 21 },
];

export const STATUS_ROWS = [
  { label: "Site", value: "Up · checked 2 min ago" },
  { label: "CortIQ snippet", value: "Found on the home page" },
  { label: "Script integrity", value: "Pinned version, SRI hash matches" },
];

export const PLATFORMS = ["WordPress", "Next.js", "Netlify", "Cloudflare", "Node", "PHP", "GTM"];
