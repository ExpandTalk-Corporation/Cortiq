import type { BotCategory } from "@/lib/aiBotRegistry";

// One colour per AI traffic category, used for every chart, icon and legend on the homepage.
// Muted editorial palette (bronze, olive, plum). Text colours are AA on white (checked in
// tests/foundation/home-visuals.test.mjs); the dark: variants are lighter so icons stay readable.
export const CATEGORY_COLORS: Record<BotCategory, { hex: string; text: string; bg: string }> = {
  training: { hex: "#8c6a2e", text: "text-[#8c6a2e] dark:text-[#c9a464]", bg: "bg-[#8c6a2e]" },
  agentic: { hex: "#4a6b45", text: "text-[#4a6b45] dark:text-[#8fb588]", bg: "bg-[#4a6b45]" },
  citation: { hex: "#5a4f8c", text: "text-[#5a4f8c] dark:text-[#a99fdb]", bg: "bg-[#5a4f8c]" },
};
