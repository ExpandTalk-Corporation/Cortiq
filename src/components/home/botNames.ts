import { botsInCategory, type BotCategory } from "@/lib/aiBotRegistry";

// Bot names on the homepage come from the ingest registry, so the page only names bots CortIQ classifies.
export const botNames = (category: BotCategory): string[] => [...new Set(botsInCategory(category).map((b) => b.name))];

export const examplesFor = (category: BotCategory): string => botNames(category).slice(0, 4).join(", ");
