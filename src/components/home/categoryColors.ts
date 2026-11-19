import type { BotCategory } from "@/lib/aiBotRegistry";

// One colour per AI traffic category, used for every chart, icon and legend on the homepage.
// Text colours are AA on white (checked in tests/foundation/home-visuals.test.mjs).
export const CATEGORY_COLORS: Record<BotCategory, { hex: string; text: string; bg: string }> = {
  training: { hex: "#dc2626", text: "text-red-600", bg: "bg-red-600" },
  agentic: { hex: "#15803d", text: "text-green-700", bg: "bg-green-700" },
  citation: { hex: "#2563eb", text: "text-blue-600", bg: "bg-blue-600" },
};
