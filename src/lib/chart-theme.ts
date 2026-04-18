// Chart theme constants for progression charts
// Follows dark mode design system

export const CHART_COLORS = {
  // Pillar colors
  poussee: "#3B82F6",    // blue
  tirage: "#22C55E",     // green
  squat: "#F97316",      // orange
  hanche: "#EF4444",     // red
  epaules: "#A855F7",    // purple
  bras: "#06B6D4",       // cyan
  jambes_iso: "#EAB308", // yellow
  core: "#6B7280",       // gray
} as const;

export type Pillar = keyof typeof CHART_COLORS;

export const CHART_THEME = {
  backgroundColor: "transparent",
  textColor: "#9ca3af", // zinc-400
  textColorLight: "#d1d5db", // zinc-300
  gridColor: "rgba(255,255,255,0.05)",
  tooltipBg: "#18181b", // zinc-900
  tooltipBorder: "#27272a", // zinc-800
  fontSize: {
    xs: 10,
    sm: 12,
    base: 14,
  },
  fontFamily: "system-ui, -apple-system, sans-serif",
} as const;

// Helper to get pillar color
export function getPillarColor(pilier: string): string {
  const key = pilier.toLowerCase() as Pillar;
  return CHART_COLORS[key] || CHART_COLORS.core;
}