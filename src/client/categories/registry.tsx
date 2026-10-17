import { HeartPulse, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { BpHighlights } from "./bp/BpHighlights.tsx";
import { BpSummaryCard } from "./bp/BpSummaryCard.tsx";

/**
 * A health category. Each one owns its routes and contributes a card to the Summary screen, so
 * adding a category (weight, sleep, medication...) doesn't mean restructuring the app.
 */
export interface Category {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** CSS custom property holding the category's identity colour. */
  colorVar: `--${string}`;
  path: string;
  newEntryPath: string;
  SummaryCard: ComponentType;
  /** Renders a few noteworthy insight cards, or nothing. */
  Highlights: ComponentType;
}

export const CATEGORIES: readonly Category[] = [
  {
    id: "bp",
    name: "Blood pressure",
    description: "Systolic, diastolic and pulse",
    icon: HeartPulse,
    colorVar: "--bp",
    path: "/bp",
    newEntryPath: "/bp/new",
    SummaryCard: BpSummaryCard,
    Highlights: BpHighlights,
  },
];
