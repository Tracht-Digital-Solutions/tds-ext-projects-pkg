import type { StatusStyle } from "@tracht-digital-solutions/tds-shared/components";

/**
 * Project and milestone statuses: label + chip tone. One map for both islands
 * (the portal list and the admin screen kept identical copies "in sync" by
 * comment). Rendered through tds-shared `StatusChip`, which resolves the tone
 * to a real `chip--*` class instead of interpolating one.
 */
export const PROJECT_STATUS: Readonly<Record<string, StatusStyle>> = {
  discovery: { label: "Analyse", tone: "info" },
  in_progress: { label: "In Arbeit", tone: "warning" },
  review: { label: "Abnahme", tone: "cat-violet" },
  delivered: { label: "Abgeschlossen", tone: "success" },
  on_hold: { label: "Pausiert", tone: "neutral" },
};

export const MILESTONE_STATUS: Readonly<Record<string, StatusStyle>> = {
  pending: { label: "Offen", tone: "neutral" },
  in_progress: { label: "In Arbeit", tone: "warning" },
  completed: { label: "Erledigt", tone: "success" },
};
