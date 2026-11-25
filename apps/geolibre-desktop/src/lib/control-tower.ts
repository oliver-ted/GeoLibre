/**
 * Control Tower: the project-driven "live map" presentation used by the Nova
 * Biomedical demos. A project opts in by carrying a `ControlTowerConfig` under
 * `metadata.controlTower`; the shell then replaces the story-map scroller and
 * dashboard with a persistent scenario switcher, KPI strip, lens rail and a
 * context panel that reacts to what is clicked on the map.
 *
 * Everything the UI shows is data from this config (precomputed by the demo
 * generator), so the component stays generic: a different client's project can
 * drive the same shell with different lenses, scenarios and sections.
 */
import type { MapViewState } from "@geolibre/core";

export type CtCamera = Pick<MapViewState, "center" | "zoom" | "pitch" | "bearing">;

export type CtKpiFormat = "pct" | "days" | "usd" | "int" | "kg";

export interface CtKpi {
  id: string;
  label: string;
  value: number;
  format: CtKpiFormat;
  /** Small text after the value, e.g. "46/47". */
  detail?: string;
  /** When true a rising value is bad (freight); default: a falling value is bad (SLA). */
  higherIsWorse?: boolean;
}

export type CtTone = "neutral" | "danger" | "warning" | "good" | "accent";

export interface CtException {
  id: string;
  severity: "red" | "amber";
  /** Two-to-three letter badge, e.g. "SLA" or "IN". */
  badge: string;
  title: string;
  detail: string;
  value: string;
  valueLabel: string;
  /** Fly here when clicked. */
  location?: [number, number];
  zoom?: number;
}

export interface CtRecommendation {
  title: string;
  body: string;
  /** Scenario to switch to when the action is pressed. */
  scenarioId?: string;
  actionLabel?: string;
}

export interface CtScenario {
  id: string;
  label: string;
  tone: "normal" | "danger" | "good";
  /** Opacity for every scenario-managed layer, by layer id (absent = untouched). */
  layers: Record<string, number>;
  kpis: CtKpi[];
  exceptions: CtException[];
  alert?: { title: string; body: string };
  recommendation?: CtRecommendation;
  camera?: CtCamera;
}

export interface CtListRow {
  title: string;
  detail?: string;
  value?: string;
  valueLabel?: string;
  tone?: CtTone;
  badge?: string;
  location?: [number, number];
  zoom?: number;
}

export type CtSection =
  | { type: "kpis"; items: Array<{ label: string; value: string; detail?: string; tone?: CtTone }> }
  | { type: "list"; title: string; count?: string; rows: CtListRow[] }
  | { type: "table"; title: string; columns: string[]; rows: string[][]; highlightRows?: number[] }
  | { type: "card"; title: string; body: string; tone?: CtTone; actions?: string[] }
  | {
      type: "timeline";
      title: string;
      rows: Array<{ time: string; title: string; detail?: string }>;
    }
  | { type: "bars"; title: string; rows: Array<{ label: string; value: number; display: string }> };

export interface CtTourStep {
  id: string;
  title: string;
  /** Sanitized HTML (same rules as story-map chapter descriptions). */
  body: string;
  camera: CtCamera;
  /** Layer opacities to apply on enter. */
  layers?: Record<string, number>;
}

export interface CtAskItem {
  question: string;
  /** Sanitized HTML answer. */
  answer: string;
  citations?: string[];
  /** Layers to show (opacity 1) while this answer is displayed. */
  highlightLayers?: string[];
  /** Scenario to switch to while this answer is displayed. */
  scenarioId?: string;
  camera?: CtCamera;
}

export interface CtLegendItem {
  label: string;
  color: string;
  kind?: "dot" | "line" | "ring";
}

export interface CtLens {
  id: string;
  label: string;
  /** Project URL (relative to the app base, or absolute). */
  url: string;
  icon: "network" | "sourcing" | "routes" | "inbound" | "scenarios" | "installed";
  badge?: number;
}

export interface ControlTowerConfig {
  version: 1;
  /** Shown in the breadcrumb, e.g. "Nova Biomedical". */
  client: string;
  /** Breadcrumb tail, e.g. "Network". */
  title: string;
  lensId: string;
  lenses: CtLens[];
  scenarios: CtScenario[];
  defaultScenarioId: string;
  views: Array<{ label: string; camera: CtCamera }>;
  /** Static context-panel sections for this lens (shown under the exceptions). */
  sections: CtSection[];
  /** Title of the context panel when nothing is selected. */
  panelTitle: string;
  panelSubtitle?: string;
  /** Layers whose feature clicks open the explain card. */
  explainLayers: string[];
  tour: { steps: CtTourStep[]; durationLabel?: string };
  ask: { placeholder: string; items: CtAskItem[] };
  /** Legend title override. */
  legendTitle?: string;
  /** Compact legend drawn by the shell (the project's own legend panel is hidden). */
  legend?: { title: string; items: CtLegendItem[] };
  /** Small footnote shown in the panel footer. */
  dataNotice?: string;
}

/** Returns the Control Tower config carried by a project's metadata, if valid. */
export function readControlTowerConfig(
  metadata: Record<string, unknown> | undefined | null,
): ControlTowerConfig | null {
  const raw = metadata?.controlTower;
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<ControlTowerConfig>;
  if (c.version !== 1) return null;
  if (!Array.isArray(c.scenarios) || c.scenarios.length === 0) return null;
  if (!Array.isArray(c.lenses) || typeof c.lensId !== "string") return null;
  return {
    version: 1,
    client: typeof c.client === "string" ? c.client : "",
    title: typeof c.title === "string" ? c.title : "",
    lensId: c.lensId,
    lenses: c.lenses,
    scenarios: c.scenarios,
    defaultScenarioId:
      typeof c.defaultScenarioId === "string" ? c.defaultScenarioId : c.scenarios[0].id,
    views: Array.isArray(c.views) ? c.views : [],
    sections: Array.isArray(c.sections) ? c.sections : [],
    panelTitle: typeof c.panelTitle === "string" ? c.panelTitle : "",
    panelSubtitle: typeof c.panelSubtitle === "string" ? c.panelSubtitle : undefined,
    explainLayers: Array.isArray(c.explainLayers) ? c.explainLayers : [],
    tour: c.tour && Array.isArray(c.tour.steps) ? c.tour : { steps: [] },
    ask: c.ask && Array.isArray(c.ask.items) ? c.ask : { placeholder: "", items: [] },
    legendTitle: typeof c.legendTitle === "string" ? c.legendTitle : undefined,
    legend: c.legend && Array.isArray(c.legend.items) ? c.legend : undefined,
    dataNotice: typeof c.dataNotice === "string" ? c.dataNotice : undefined,
  };
}

const INT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** Formats a KPI value for the strip. */
export function formatKpi(kpi: Pick<CtKpi, "value" | "format">): string {
  switch (kpi.format) {
    case "pct":
      return `${kpi.value.toFixed(1)}%`;
    case "days":
      return kpi.value.toFixed(1);
    case "usd":
      return `$${INT.format(Math.round(kpi.value))}`;
    case "kg":
    case "int":
    default:
      return INT.format(Math.round(kpi.value));
  }
}

/** Unit label shown after a KPI value. */
export function kpiUnit(kpi: Pick<CtKpi, "format">): string {
  return kpi.format === "days" ? "days" : kpi.format === "kg" ? "kg" : "";
}

/**
 * Change of a KPI against its baseline: `null` for no meaningful change, else
 * the signed percent and whether that direction is bad for this KPI.
 */
export function kpiDelta(
  kpi: CtKpi,
  base: CtKpi | undefined,
): { pct: number; bad: boolean } | null {
  if (!base || base.value === 0) return null;
  const pct = Math.round(((kpi.value - base.value) / Math.abs(base.value)) * 100);
  if (pct === 0) return null;
  const bad = kpi.higherIsWorse ? pct > 0 : pct < 0;
  return { pct, bad };
}

/**
 * Parses the `alternatives` property the demo generator writes onto customer
 * features: a JSON array of option rows for the explain card.
 */
export interface CtAlternative {
  node: string;
  mode: string;
  km: number;
  days: number;
  cost: number;
  status: "chosen" | "no stock" | "not allowed" | "misses SLA" | "costlier";
}
export function parseAlternatives(value: unknown): CtAlternative[] {
  if (typeof value !== "string") return [];
  try {
    const rows = JSON.parse(value);
    return Array.isArray(rows) ? (rows as CtAlternative[]) : [];
  } catch {
    return [];
  }
}
