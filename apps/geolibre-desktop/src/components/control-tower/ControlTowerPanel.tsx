/**
 * The Control Tower's context panel: exceptions and sections for the active
 * scenario, the explain card for a clicked feature, or the Ask conversation.
 * Everything rendered here is data from the project's `ControlTowerConfig`.
 */
import { cn } from "@geolibre/ui";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  parseAlternatives,
  type CtAlternative,
  type CtAskItem,
  type CtException,
  type CtListRow,
  type CtScenario,
  type CtSection,
  type CtTone,
  type ControlTowerConfig,
} from "../../lib/control-tower";
import { sanitizeStoryHtml } from "../../lib/sanitize-html";
import { CtIcon } from "./icons";

const TONE_TEXT: Record<CtTone, string> = {
  neutral: "text-slate-300",
  danger: "text-red-300",
  warning: "text-amber-300",
  good: "text-emerald-300",
  accent: "text-sky-300",
};
const TONE_BOX: Record<CtTone, string> = {
  neutral: "border-white/10 bg-slate-900/60",
  danger: "border-red-500/40 bg-red-500/10",
  warning: "border-amber-500/40 bg-amber-500/10",
  good: "border-emerald-500/40 bg-emerald-500/10",
  accent: "border-sky-500/40 bg-sky-500/10",
};

export const ctButton = (variant: "primary" | "ghost" | "good" | "plain" = "plain") =>
  cn(
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
    variant === "primary" &&
      "border-transparent bg-gradient-to-b from-sky-400 to-sky-500 font-semibold text-sky-950 shadow-[0_2px_12px_rgba(56,189,248,.35)] hover:from-sky-300",
    variant === "good" &&
      "border-transparent bg-gradient-to-b from-emerald-400 to-emerald-500 font-semibold text-emerald-950 hover:from-emerald-300",
    variant === "ghost" && "border-transparent bg-transparent text-slate-300 hover:bg-white/5",
    variant === "plain" && "border-white/10 bg-slate-800/70 text-slate-100 hover:bg-slate-700/70",
  );

export function SectionTitle({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: React.ReactNode;
}) {
  return (
    <div className="mt-1 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-slate-500">
      {children}
      {count !== undefined ? (
        <span className="ms-auto font-medium normal-case tracking-normal text-slate-400">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function Html({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn("ct-html text-xs leading-relaxed text-slate-300", className)}
      // Sanitized: the config comes from a project file that may be shared.
      dangerouslySetInnerHTML={{ __html: sanitizeStoryHtml(html) }}
    />
  );
}

export function Tag({
  tone = "neutral",
  children,
  className,
}: {
  tone?: CtTone;
  children: React.ReactNode;
  className?: string;
}) {
  const bg: Record<CtTone, string> = {
    neutral: "bg-slate-500/20 text-slate-200",
    danger: "bg-red-500/20 text-red-200",
    warning: "bg-amber-500/20 text-amber-200",
    good: "bg-emerald-500/20 text-emerald-200",
    accent: "bg-sky-500/20 text-sky-200",
  };
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded px-1.5 py-0.5 text-start text-[10.5px] font-semibold leading-snug",
        bg[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ListRow({
  row,
  onFly,
  selected,
}: {
  row: CtListRow;
  onFly?: (location: [number, number], zoom?: number) => void;
  selected?: boolean;
}) {
  const tone = row.tone ?? "neutral";
  const clickable = Boolean(row.location && onFly);
  const Comp = clickable ? "button" : "div";
  return (
    <Comp
      type={clickable ? "button" : undefined}
      onClick={clickable ? () => onFly?.(row.location!, row.zoom) : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-start",
        TONE_BOX[tone === "neutral" ? "neutral" : tone],
        clickable && "hover:border-sky-400/50",
        selected && "border-sky-400/60 bg-sky-500/10",
      )}
    >
      {row.badge ? (
        <span
          className={cn(
            "grid h-7 w-7 flex-none place-items-center rounded-md text-[10.5px] font-bold",
            tone === "danger"
              ? "bg-red-500/20 text-red-200"
              : tone === "warning"
                ? "bg-amber-500/20 text-amber-200"
                : tone === "good"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-sky-500/20 text-sky-200",
          )}
        >
          {row.badge}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold leading-snug text-slate-100">{row.title}</span>
        {row.detail ? (
          <span className="block text-[11px] leading-snug text-slate-400">{row.detail}</span>
        ) : null}
      </span>
      {row.value ? (
        <span className="ms-auto flex-none text-end">
          <span className={cn("block text-xs font-semibold", TONE_TEXT[tone])}>{row.value}</span>
          {row.valueLabel ? (
            <span className="block text-[10px] text-slate-500">{row.valueLabel}</span>
          ) : null}
        </span>
      ) : null}
    </Comp>
  );
}

export function exceptionToRow(e: CtException): CtListRow {
  return {
    badge: e.badge,
    title: e.title,
    detail: e.detail,
    value: e.value,
    valueLabel: e.valueLabel,
    tone: e.severity === "red" ? "danger" : "warning",
    location: e.location,
    zoom: e.zoom,
  };
}

export function Section({
  section,
  onFly,
}: {
  section: CtSection;
  onFly: (location: [number, number], zoom?: number) => void;
}) {
  switch (section.type) {
    case "kpis":
      return (
        <div className="grid grid-cols-3 gap-2">
          {section.items.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-2"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-slate-500">
                {item.label}
              </div>
              <div
                className={cn("mt-0.5 text-sm font-semibold", TONE_TEXT[item.tone ?? "neutral"])}
              >
                {item.value}
              </div>
              {item.detail ? (
                <div className="text-[10.5px] text-slate-500">{item.detail}</div>
              ) : null}
            </div>
          ))}
        </div>
      );
    case "list":
      return (
        <div className="flex flex-col gap-1.5">
          <SectionTitle count={section.count}>{section.title}</SectionTitle>
          {section.rows.map((row, i) => (
            <ListRow key={`${row.title}-${i}`} row={row} onFly={onFly} />
          ))}
        </div>
      );
    case "table": {
      // The panel is narrow, so wide tables render as stacked rows: the first
      // column is the row's title and the rest are label/value pairs. Long
      // values (a reason, a flag list) take the full width.
      if (section.columns.length > 4) {
        return (
          <div className="flex flex-col gap-1.5">
            <SectionTitle>{section.title}</SectionTitle>
            {section.rows.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border px-2.5 py-2",
                  section.highlightRows?.includes(i)
                    ? "border-red-500/35 bg-red-500/10"
                    : "border-white/10 bg-slate-950/40",
                )}
              >
                <div className="text-xs font-semibold text-slate-100">{r[0]}</div>
                <dl className="mt-1 grid grid-cols-3 gap-x-2 gap-y-1">
                  {r.slice(1).map((cell, j) => {
                    const long = cell.length > 18;
                    return (
                      <div key={j} className={cn("min-w-0", long && "col-span-3")}>
                        <dt className="text-[10px] uppercase tracking-[.05em] text-slate-500">
                          {section.columns[j + 1]}
                        </dt>
                        <dd className="m-0 text-[11.5px] leading-snug text-slate-300">{cell}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-1.5">
          <SectionTitle>{section.title}</SectionTitle>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {section.columns.map((c) => (
                    <th
                      key={c}
                      className="whitespace-nowrap border-b border-white/10 px-2 py-1.5 text-start text-[10px] font-semibold uppercase tracking-[.05em] text-slate-500"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((r, i) => (
                  <tr
                    key={i}
                    className={cn(
                      section.highlightRows?.includes(i) ? "bg-red-500/10" : "",
                      "border-b border-white/5 last:border-0",
                    )}
                  >
                    {r.map((cell, j) => (
                      <td
                        key={j}
                        className={cn(
                          "px-2 py-1.5 align-top leading-snug text-slate-300",
                          j === 0 && "font-medium text-slate-100",
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    case "card":
      return (
        <div className={cn("rounded-lg border px-3 py-2.5", TONE_BOX[section.tone ?? "neutral"])}>
          <h3 className="mb-1 text-xs font-semibold text-slate-100">{section.title}</h3>
          <Html html={section.body} />
        </div>
      );
    case "timeline":
      return (
        <div className="flex flex-col gap-1">
          <SectionTitle>{section.title}</SectionTitle>
          <ol className="flex flex-col">
            {section.rows.map((row, i) => (
              <li key={i} className="flex items-start gap-2.5 py-1">
                <span className="w-10 flex-none pt-0.5 font-mono text-[10.5px] text-slate-500">
                  {row.time}
                </span>
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 flex-none rounded-full",
                    i === 0 || i === section.rows.length - 1 ? "bg-slate-100" : "bg-sky-400",
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-xs text-slate-100">{row.title}</span>
                  {row.detail ? (
                    <span className="block text-[11px] text-slate-400">{row.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      );
    case "bars": {
      const max = Math.max(...section.rows.map((r) => r.value), 1);
      return (
        <div className="flex flex-col gap-1.5">
          <SectionTitle>{section.title}</SectionTitle>
          {section.rows.map((row) => (
            <div key={row.label} className="flex items-center gap-2 text-xs">
              <span className="w-24 leading-tight text-slate-200">{row.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-500/20">
                <div
                  className="h-full rounded bg-gradient-to-r from-orange-500 to-amber-400"
                  style={{ width: `${Math.round((100 * row.value) / max)}%` }}
                />
              </div>
              <span className="w-16 text-end font-mono text-[11px] text-slate-400">
                {row.display}
              </span>
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- explain card

export interface SelectedFeature {
  layerId: string;
  layerName: string;
  featureId?: string | number;
  properties: Record<string, unknown>;
}

const HIDDEN_PROPS = new Set([
  "alternatives",
  "color",
  "height_m",
  "within_sla_pct",
  "optimal_not_nearest",
  "label",
  "stroke",
  "stroke-width",
  "demand_index",
  "id",
]);
const LABELS: Record<string, string> = {
  segment: "Segment",
  family: "Product family",
  weekly_shipments: "Weekly shipments",
  served_from: "Optimal source",
  mode: "Mode",
  transit_days: "Transit (days)",
  sla_days: "SLA (days)",
  sla_status: "Status",
  nearest_node: "Nearest node",
  why: "Why this source",
  weekly_freight_usd: "Weekly freight (USD)",
  weekly_co2e_kg: "Weekly CO₂e (kg)",
  cost_per_shipment_usd: "Cost per shipment (USD)",
  nearest_km: "Nearest node (km)",
  type: "Type",
  role: "Role in network",
  status: "Status",
  erp_users: "ERP users",
  crm_users: "CRM users",
  total_users: "Total users",
  ships: "Ships",
  code: "Code",
  material: "Material",
  location: "Ships from",
  receiving_site: "Receiving site",
  lead_time_days: "Lead time (days)",
  weekly_volume: "Weekly volume",
  single_source: "Single source",
  risk: "Risk",
  flags: "Risk flags",
  beds: "Beds",
  blood_gas_analyzers: "Blood-gas analyzers",
  poc_glucose_meters: "Point-of-care meters",
  cartridges_per_month: "Sensor cartridges / month",
  test_strips_per_month: "Test strips / month",
  consumables_usd_month: "Consumables (USD / month)",
  service_due: "Field service",
  installed_months_ago: "Installed (months ago)",
  metro: "Metro",
  region: "Region",
  route: "Route",
  stop: "Stop #",
  sequence: "Sequence",
  stops: "Stops",
  route_km: "Route km",
  direct_km: "Direct out-and-back km",
  saved_pct: "Saved (%)",
  name: "Name",
};
const prettyKey = (k: string) =>
  LABELS[k] ?? k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** The card already says "nearest node", so drop the generator's prefix from its reason. */
function shortReason(why: string): string {
  const stripped = why.replace(/^Nearest node \([^)]*\)\s*/i, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function statusTone(status: CtAlternative["status"]): CtTone {
  return status === "chosen"
    ? "accent"
    : status === "misses SLA"
      ? "warning"
      : status === "costlier"
        ? "neutral"
        : "neutral";
}

export function ExplainCard({ feature }: { feature: SelectedFeature }) {
  const { t } = useTranslation();
  const p = feature.properties;
  const alternatives = useMemo(() => parseAlternatives(p.alternatives), [p.alternatives]);
  const isCustomer = typeof p.served_from === "string";
  const rows = Object.entries(p).filter(
    ([k, v]) => !HIDDEN_PROPS.has(k) && k !== "name" && v !== null && v !== undefined && v !== "",
  );
  if (!isCustomer) {
    return (
      <div className="flex flex-col gap-1">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5 text-xs last:border-0"
          >
            <span className="text-slate-400">{prettyKey(k)}</span>
            <span className="text-end font-medium text-slate-100">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  const nearest = String(p.nearest_node ?? "");
  const optimal = String(p.served_from ?? "");
  const same = nearest === optimal;
  const within = p.sla_status === "Within SLA";
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-slate-500">
            {t("controlTower.explain.nearestNode")}
          </div>
          <div className="mt-0.5 font-mono text-lg font-semibold text-slate-100">{nearest}</div>
          <div className="text-[11px] text-slate-400">
            {t("controlTower.explain.roadKm", { km: Number(p.nearest_km ?? 0) })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {!same ? (
              <Tag tone="danger">{shortReason(String(p.why ?? ""))}</Tag>
            ) : (
              <Tag tone="good">{t("controlTower.explain.alsoOptimal")}</Tag>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-sky-400/50 bg-sky-500/10 px-2.5 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-sky-300">
            {t("controlTower.explain.optimalSource")} ✓
          </div>
          <div className="mt-0.5 font-mono text-lg font-semibold text-slate-100">{optimal}</div>
          <div className="text-[11px] text-slate-400">
            {String(p.mode ?? "")} ·{" "}
            {t("controlTower.explain.days", { count: Number(p.transit_days ?? 0) })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Tag tone={within ? "good" : "danger"}>
              {within
                ? t("controlTower.explain.withinSla", { days: Number(p.sla_days ?? 0) })
                : t("controlTower.explain.missesSla", { days: Number(p.sla_days ?? 0) })}
            </Tag>
            {p.cost_per_shipment_usd !== undefined ? (
              <Tag tone="accent">${String(p.cost_per_shipment_usd)}</Tag>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          ["segment", p.segment],
          ["family", p.family],
          ["weekly_shipments", p.weekly_shipments],
          ["weekly_freight_usd", p.weekly_freight_usd],
          ["weekly_co2e_kg", p.weekly_co2e_kg],
          ["sla_days", p.sla_days],
        ].map(([k, v]) => (
          <div
            key={String(k)}
            className="rounded-md border border-white/5 bg-slate-950/30 px-2 py-1.5"
          >
            <div className="text-[10px] uppercase tracking-[.05em] text-slate-500">
              {prettyKey(String(k))}
            </div>
            <div className="font-medium text-slate-100">{String(v ?? "—")}</div>
          </div>
        ))}
      </div>
      {alternatives.length ? (
        <div className="flex flex-col gap-1.5">
          <SectionTitle
            count={t("controlTower.explain.optionsCount", { count: alternatives.length })}
          >
            {t("controlTower.explain.alternatives")}
          </SectionTitle>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[.05em] text-slate-500">
                  <th className="px-2 py-1.5 text-start font-semibold">
                    {t("controlTower.explain.node")}
                  </th>
                  <th className="px-2 py-1.5 text-start font-semibold">
                    {t("controlTower.explain.mode")}
                  </th>
                  <th className="px-2 py-1.5 text-end font-semibold">km</th>
                  <th className="px-2 py-1.5 text-end font-semibold">
                    {t("controlTower.explain.daysShort")}
                  </th>
                  <th className="px-2 py-1.5 text-end font-semibold">$</th>
                  <th className="px-2 py-1.5">
                    <span className="sr-only">{t("controlTower.explain.statusColumn")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {alternatives.map((o, i) => {
                  const off = o.status === "no stock" || o.status === "not allowed";
                  return (
                    <tr
                      key={i}
                      className={cn(
                        "border-t border-white/5",
                        o.status === "chosen" && "bg-sky-500/10",
                        off && "text-slate-500",
                      )}
                    >
                      <td className="px-2 py-1.5 font-mono">{o.node}</td>
                      <td className="px-2 py-1.5">{o.mode}</td>
                      <td className="px-2 py-1.5 text-end font-mono">{o.km.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-end font-mono">{o.days}</td>
                      <td className="px-2 py-1.5 text-end font-mono">{o.cost}</td>
                      <td className="px-2 py-1.5">
                        <Tag tone={statusTone(o.status)}>
                          {t(`controlTower.explain.status.${o.status.replace(" ", "_")}` as never)}
                        </Tag>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- ask

export interface AskTurn {
  question: string;
  item: CtAskItem | null;
}

/** Picks the scripted answer whose question shares the most words with the input. */
export function matchAskItem(input: string, items: CtAskItem[]): CtAskItem | null {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const q = words(input);
  let best: CtAskItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    const w = words(item.question + " " + item.answer.replace(/<[^>]+>/g, " "));
    let score = 0;
    for (const x of q) if (w.has(x)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 2 ? best : null;
}

export function AskPanel({
  config,
  turns,
  onAsk,
  activeScenario,
}: {
  config: ControlTowerConfig;
  turns: AskTurn[];
  onAsk: (question: string, item: CtAskItem | null) => void;
  activeScenario: CtScenario;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q) return;
    onAsk(q, matchAskItem(q, config.ask.items));
    setDraft("");
  };
  const asked = new Set(turns.map((x) => x.item?.question));
  const suggestions = config.ask.items.filter((i) => !asked.has(i.question)).slice(0, 4);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pe-1">
        {turns.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-400">{t("controlTower.ask.intro")}</p>
        ) : null}
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="ms-6 self-end rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-xs text-slate-100">
              {turn.question}
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5">
              {turn.item ? (
                <>
                  <Html html={turn.item.answer} className="[&_p]:mb-2 [&_p:last-child]:mb-0" />
                  {turn.item.citations?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {turn.item.citations.map((c) => (
                        <span
                          key={c}
                          className="rounded border border-white/10 bg-slate-950/60 px-1.5 py-0.5 text-[10px] text-slate-400"
                        >
                          ⟐ {c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {turn.item.highlightLayers?.length || turn.item.scenarioId ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Tag tone="accent">{t("controlTower.ask.shownOnMap")}</Tag>
                      {turn.item.scenarioId && turn.item.scenarioId !== activeScenario.id ? (
                        <Tag tone="warning">
                          {t("controlTower.ask.scenarioPreview", {
                            scenario:
                              config.scenarios.find((s) => s.id === turn.item?.scenarioId)?.label ??
                              turn.item.scenarioId,
                          })}
                        </Tag>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-xs leading-relaxed text-slate-300">
                  {t("controlTower.ask.fallback")}
                </p>
              )}
            </div>
          </div>
        ))}
        {suggestions.length ? (
          <div className="flex flex-col gap-1.5">
            <SectionTitle>{t("controlTower.ask.try")}</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((item) => (
                <button
                  key={item.question}
                  type="button"
                  onClick={() => onAsk(item.question, item)}
                  className="rounded-full border border-white/10 bg-slate-900/60 px-2.5 py-1 text-start text-[11px] text-slate-300 hover:border-sky-400/50 hover:text-slate-100"
                >
                  {item.question}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <form
        onSubmit={submit}
        className="flex items-center gap-2 rounded-xl border border-sky-400/40 bg-slate-950/70 px-3 py-1.5 shadow-[0_0_0_4px_rgba(56,189,248,.08)]"
      >
        <CtIcon name="ask" className="h-4 w-4 flex-none text-sky-400" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={config.ask.placeholder || t("controlTower.ask.placeholder")}
          aria-label={t("controlTower.ask.title")}
          className="min-w-0 flex-1 bg-transparent py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          className={ctButton("primary")}
          aria-label={t("controlTower.ask.send")}
        >
          ↵
        </button>
      </form>
    </div>
  );
}
