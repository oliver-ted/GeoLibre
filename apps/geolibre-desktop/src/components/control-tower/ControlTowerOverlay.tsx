/**
 * Control Tower: a persistent "live map" presentation driven by the project's
 * `metadata.controlTower` config (see `lib/control-tower.ts`).
 *
 * It mounts over the map area and keeps the map interactive underneath. The
 * scenario switcher, KPI strip, lens rail, context panel and tour strip are
 * all data from the config; the shell only wires them to the map:
 *
 * - Scenario, tour and Ask layer changes go through the story-map fade path
 *   (`setStoryLayerOpacity` on the engine + `setStorymapLayerOpacity` in the
 *   store) so deck.gl layers follow and the project is never marked dirty.
 * - The camera moves with `engine.flyTo`, which also leaves the project clean.
 * - Clicks on the configured layers open the explain card through
 *   `engine.identifyFeatures`.
 * - Lenses are other project files, opened through the same action as the
 *   toolbar's Demos menu.
 */
import { useAppStore } from "@geolibre/core";
import type { MapEngine } from "@geolibre/map";
import { cn } from "@geolibre/ui";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectFileActions } from "../../hooks/useProjectFileActions";
import {
  formatKpi,
  kpiDelta,
  kpiUnit,
  readControlTowerConfig,
  type ControlTowerConfig,
  type CtAskItem,
  type CtCamera,
  type CtScenario,
} from "../../lib/control-tower";
import { sanitizeStoryHtml } from "../../lib/sanitize-html";
import { resolveDemoUrl } from "../layout/toolbar/DemosMenu";
import {
  AskPanel,
  ExplainCard,
  ListRow,
  Section,
  SectionTitle,
  Tag,
  ctButton,
  exceptionToRow,
  type AskTurn,
  type SelectedFeature,
} from "./ControlTowerPanel";
import { CtIcon } from "./icons";

interface Props {
  mapControllerRef: RefObject<MapEngine | null>;
  mapReadyGeneration: number;
  projectFiles: Pick<ProjectFileActions, "openDemoProject">;
}

const PANEL_W = 380;
const RAIL_W = 72;
const FLY_MS = 1400;
const FADE_MS = 600;

/** Renders the Control Tower when the loaded project carries a config. */
export function ControlTowerOverlay(props: Props) {
  const metadata = useAppStore((s) => s.metadata);
  const projectGeneration = useAppStore((s) => s.projectGeneration);
  const config = useMemo(() => readControlTowerConfig(metadata), [metadata]);
  if (!config) return null;
  return <ControlTower key={projectGeneration} config={config} {...props} />;
}

function ControlTower({
  config,
  mapControllerRef,
  mapReadyGeneration,
  projectFiles,
}: Props & { config: ControlTowerConfig }) {
  const { t } = useTranslation();
  const layers = useAppStore((s) => s.layers);
  const layerById = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const baseScenario =
    config.scenarios.find((s) => s.id === config.defaultScenarioId) ?? config.scenarios[0];
  const [scenarioId, setScenarioId] = useState(baseScenario.id);
  const scenario = config.scenarios.find((s) => s.id === scenarioId) ?? baseScenario;
  const [viewLabel, setViewLabel] = useState<string | null>(config.views[0]?.label ?? null);
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askTurns, setAskTurns] = useState<AskTurn[]>([]);
  const [showAllExceptions, setShowAllExceptions] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);

  const engine = useCallback(() => mapControllerRef.current, [mapControllerRef]);

  // ---- map helpers -------------------------------------------------------
  const applyLayers = useCallback(
    (changes: Record<string, number>, durationMs = FADE_MS) => {
      const e = engine();
      for (const [id, opacity] of Object.entries(changes))
        e?.setStoryLayerOpacity(id, opacity, durationMs);
      useAppStore.getState().setStorymapLayerOpacity(changes);
    },
    [engine],
  );
  const flyTo = useCallback(
    (camera: CtCamera | undefined, duration = FLY_MS) => {
      if (!camera) return;
      engine()?.flyTo({ ...camera, duration });
    },
    [engine],
  );
  const flyToPoint = useCallback(
    (location: [number, number], zoom?: number) => {
      const e = engine();
      const current = e?.readView();
      e?.flyTo({
        center: location,
        zoom: zoom ?? Math.max(current?.zoom ?? 4, 5),
        duration: FLY_MS,
      });
    },
    [engine],
  );

  // Scenario layers: applied on change and again after an engine/style handoff.
  const scenarioLayers = scenario.layers;
  useEffect(() => {
    if (tourIndex !== null) return;
    applyLayers(scenarioLayers);
  }, [scenarioLayers, applyLayers, mapReadyGeneration, tourIndex]);

  const selectScenario = (id: string) => {
    const next = config.scenarios.find((s) => s.id === id);
    if (!next) return;
    setScenarioId(id);
    setTourIndex(null);
    setShowAllExceptions(false);
    if (next.camera) {
      flyTo(next.camera);
      setViewLabel(null);
    }
  };

  // Feature clicks → explain card.
  useEffect(() => {
    if (config.explainLayers.length === 0) return;
    let unsubscribe: (() => void) | null = null;
    let raf = 0;
    const onClick = (lngLat: [number, number]) => {
      const e = engine();
      if (!e) return;
      for (const layerId of config.explainLayers) {
        const hit = e.identifyFeatures(lngLat, layerId)[0];
        if (!hit) continue;
        const layer = layerById.get(layerId);
        setSelected({
          layerId,
          layerName: layer?.name ?? layerId,
          featureId: hit.featureId ?? undefined,
          properties: hit.properties,
        });
        setAskOpen(false);
        try {
          if (hit.featureId !== null) e.highlightFeature(layer, hit.featureId);
        } catch {
          /* highlight is best-effort */
        }
        return;
      }
    };
    const attach = () => {
      const e = engine();
      if (e) {
        unsubscribe = e.onMapClick(onClick);
        return;
      }
      raf = requestAnimationFrame(attach);
    };
    attach();
    return () => {
      unsubscribe?.();
      cancelAnimationFrame(raf);
    };
  }, [config.explainLayers, engine, layerById, mapReadyGeneration]);

  const clearSelection = () => {
    setSelected(null);
    try {
      engine()?.clearFeatureHighlight();
    } catch {
      /* ignore */
    }
  };

  // Tour.
  const tourSteps = config.tour.steps;
  const goToStep = (index: number | null) => {
    setTourIndex(index);
    if (index === null) {
      applyLayers(scenarioLayers);
      return;
    }
    const step = tourSteps[index];
    if (!step) return;
    flyTo(step.camera);
    setViewLabel(null);
    if (step.layers) applyLayers({ ...scenarioLayers, ...step.layers });
  };

  // Ask.
  const ask = (question: string, item: CtAskItem | null) => {
    setAskTurns((turns) => [...turns, { question, item }]);
    if (!item) return;
    if (item.scenarioId && item.scenarioId !== scenario.id) {
      const next = config.scenarios.find((s) => s.id === item.scenarioId);
      if (next) {
        setScenarioId(next.id);
        setTourIndex(null);
      }
    }
    if (item.highlightLayers?.length) {
      const base = config.scenarios.find((s) => s.id === item.scenarioId)?.layers ?? scenarioLayers;
      applyLayers({ ...base, ...Object.fromEntries(item.highlightLayers.map((id) => [id, 1])) });
    }
    if (item.camera) {
      flyTo(item.camera);
      setViewLabel(null);
    }
  };

  // Lens switching = opening another project file.
  const base = useMemo(
    () => new URL(import.meta.env.BASE_URL, window.location.href).toString(),
    [],
  );
  const openLens = (url: string) => void projectFiles.openDemoProject(resolveDemoUrl(url, base));

  const redCount = scenario.exceptions.filter((e) => e.severity === "red").length;
  const exceptions = showAllExceptions ? scenario.exceptions : scenario.exceptions.slice(0, 6);
  const panelMode = askOpen ? "ask" : selected ? "explain" : "default";
  const tourStep = tourIndex !== null ? tourSteps[tourIndex] : null;

  return (
    <div
      className="ct-root pointer-events-none absolute inset-0 z-[60] text-slate-100"
      style={{ fontSize: 13 }}
      data-testid="control-tower"
    >
      {/* ---- top strip: breadcrumb + scenario switcher ------------------ */}
      <div className="pointer-events-auto absolute inset-x-0 top-0 flex h-12 items-center gap-3 border-b border-white/10 bg-slate-950/85 px-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
          <span className="h-6 w-6 flex-none rounded-md bg-[conic-gradient(from_210deg,#38bdf8,#6366f1,#14b8a6,#38bdf8)] shadow-[0_0_14px_rgba(56,189,248,.35)]" />
          <span className="whitespace-nowrap font-semibold text-slate-100">
            {t("controlTower.title")}
          </span>
          <span className="text-slate-600">›</span>
          <span className="whitespace-nowrap">{config.client}</span>
          <span className="text-slate-600">›</span>
          <span className="truncate font-semibold text-slate-100">{config.title}</span>
        </div>
        {config.scenarios.length > 1 ? (
          <div
            className="ms-auto flex items-center gap-1 rounded-xl border border-white/10 bg-slate-900/70 p-1"
            role="radiogroup"
            aria-label={t("controlTower.scenario")}
          >
            <span className="px-2 text-[10.5px] uppercase tracking-[.06em] text-slate-500">
              {t("controlTower.scenario")}
            </span>
            {config.scenarios.map((s) => {
              const on = s.id === scenario.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => selectScenario(s.id)}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200",
                    on &&
                      s.tone === "normal" &&
                      "bg-sky-500/15 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,.45)]",
                    on &&
                      s.tone === "danger" &&
                      "bg-red-500/15 text-red-100 shadow-[inset_0_0_0_1px_rgba(239,68,68,.5)]",
                    on &&
                      s.tone === "good" &&
                      "bg-emerald-500/15 text-emerald-100 shadow-[inset_0_0_0_1px_rgba(34,197,94,.5)]",
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="ms-auto" />
        )}
        <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          {t("controlTower.sampleData")}
        </span>
        <button
          type="button"
          onClick={() => {
            setAskOpen((v) => !v);
            setSelected(null);
          }}
          className={cn(ctButton(askOpen ? "primary" : "plain"))}
          aria-pressed={askOpen}
        >
          <CtIcon name="ask" className="h-4 w-4" />
          {t("controlTower.ask.title")}
        </button>
      </div>

      {/* ---- lens rail ------------------------------------------------- */}
      <nav
        className="pointer-events-auto absolute bottom-0 start-0 top-12 flex flex-col items-center gap-1 border-e border-white/10 bg-slate-950/80 py-2 backdrop-blur-md"
        style={{ width: RAIL_W }}
        aria-label={t("controlTower.lenses")}
      >
        {config.lenses.map((lens) => {
          const on = lens.id === config.lensId;
          const badge =
            lens.id === "scenarios"
              ? scenario.id !== baseScenario.id
                ? redCount
                : 0
              : (lens.badge ?? 0);
          return (
            <button
              key={lens.id}
              type="button"
              onClick={() => (on ? undefined : openLens(lens.url))}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex h-14 w-[60px] flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200",
                on && "bg-sky-500/12 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,.35)]",
              )}
            >
              {on ? (
                <span className="absolute -start-1.5 bottom-3 top-3 w-[3px] rounded bg-sky-400 shadow-[0_0_10px_#38bdf8]" />
              ) : null}
              <CtIcon name={lens.icon} className="h-5 w-5" />
              <span className="max-w-full truncate px-1 leading-tight">{lens.label}</span>
              {badge > 0 ? (
                <span className="absolute end-1.5 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9.5px] font-bold text-white">
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => goToStep(tourIndex === null ? 0 : null)}
          className={cn(
            "flex h-12 w-[60px] flex-col items-center justify-center gap-1 rounded-lg text-[10px] text-slate-500 hover:bg-white/5 hover:text-slate-200",
            tourIndex !== null && "text-sky-200",
          )}
          aria-pressed={tourIndex !== null}
        >
          <CtIcon name="tour" className="h-5 w-5" />
          <span>{t("controlTower.tour.label")}</span>
        </button>
      </nav>

      {/* ---- KPI strip + saved views ------------------------------------- */}
      <div
        className="pointer-events-none absolute top-14 flex flex-col gap-2"
        style={{ insetInlineStart: RAIL_W + 12, insetInlineEnd: PANEL_W + 24 }}
      >
        <div className="flex flex-wrap gap-2">
          {scenario.kpis.map((kpi) => {
            const baseKpi =
              scenario.id === baseScenario.id
                ? undefined
                : baseScenario.kpis.find((k) => k.id === kpi.id);
            const delta = kpiDelta(kpi, baseKpi);
            const alert = delta?.bad && Math.abs(delta.pct) >= 10;
            const good = delta && !delta.bad && Math.abs(delta.pct) >= 10;
            return (
              <div
                key={kpi.id}
                className={cn(
                  "pointer-events-auto min-w-[136px] rounded-xl border px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,.35)] backdrop-blur-md",
                  alert
                    ? "border-red-500/45 bg-gradient-to-b from-red-500/15 to-slate-950/85"
                    : good
                      ? "border-emerald-500/40 bg-slate-950/80"
                      : "border-white/10 bg-slate-950/80",
                )}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[.07em] text-slate-500">
                  {kpi.label}
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5 text-xl font-semibold tracking-tight">
                  {formatKpi(kpi)}
                  {kpiUnit(kpi) || kpi.detail ? (
                    <small className="text-[11px] font-medium text-slate-400">
                      {kpiUnit(kpi) || kpi.detail}
                    </small>
                  ) : null}
                </div>
                {baseKpi ? (
                  <div
                    className={cn(
                      "mt-0.5 text-[10.5px]",
                      delta ? (delta.bad ? "text-red-300" : "text-emerald-300") : "text-slate-500",
                    )}
                  >
                    {delta
                      ? t("controlTower.kpi.vsNormal", {
                          arrow: delta.pct > 0 ? "▲" : "▼",
                          pct: Math.abs(delta.pct),
                        })
                      : t("controlTower.kpi.noChange")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {config.views.length ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("controlTower.views")}>
            {config.views.map((v) => (
              <button
                key={v.label}
                type="button"
                onClick={() => {
                  setViewLabel(v.label);
                  flyTo(v.camera);
                }}
                className={cn(
                  "pointer-events-auto rounded-lg border px-2.5 py-1.5 text-[11.5px] backdrop-blur-md transition-colors",
                  v.label === viewLabel
                    ? "border-sky-400/50 bg-sky-500/15 text-sky-100"
                    : "border-white/10 bg-slate-950/75 text-slate-400 hover:text-slate-200",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* ---- scenario alert ------------------------------------------------ */}
      {scenario.alert && tourIndex === null ? (
        <div
          className="pointer-events-auto absolute top-[168px] flex max-w-[340px] items-start gap-2.5 rounded-xl border border-red-500/50 bg-slate-950/90 p-2.5 shadow-[0_14px_40px_rgba(239,68,68,.2)] backdrop-blur-md"
          style={{ insetInlineStart: RAIL_W + 12 }}
          role="status"
        >
          <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-red-500/20 font-bold text-red-300">
            !
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold">{scenario.alert.title}</span>
            <span className="block text-[11px] leading-snug text-slate-400">
              {scenario.alert.body}
            </span>
          </span>
        </div>
      ) : null}

      {/* ---- legend -------------------------------------------------------- */}
      {config.legend ? (
        <div
          className="pointer-events-auto absolute bottom-3 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-400 backdrop-blur-md"
          style={{ insetInlineStart: RAIL_W + 12, maxWidth: 260 }}
        >
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            className="flex w-full items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-slate-500"
            aria-expanded={legendOpen}
          >
            {config.legend.title}
            <span className="ms-auto">{legendOpen ? "–" : "+"}</span>
          </button>
          {legendOpen ? (
            <ul className="mt-1.5 flex flex-col gap-1">
              {config.legend.items.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  {item.kind === "line" ? (
                    <span
                      className="h-0.5 w-4 flex-none rounded"
                      style={{ background: item.color }}
                    />
                  ) : item.kind === "ring" ? (
                    <span
                      className="h-2.5 w-2.5 flex-none rounded-full border-2"
                      style={{ borderColor: item.color }}
                    />
                  ) : (
                    <span
                      className="h-2.5 w-2.5 flex-none rounded-full"
                      style={{ background: item.color }}
                    />
                  )}
                  <span className="leading-tight">{item.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* ---- tour strip + step card --------------------------------------- */}
      {tourSteps.length ? (
        <div
          className="pointer-events-none absolute bottom-3 flex flex-col items-center gap-2"
          style={{ insetInlineStart: RAIL_W + 290, insetInlineEnd: PANEL_W + 24 }}
        >
          {tourStep ? (
            <div className="pointer-events-auto w-full max-w-[560px] rounded-2xl border border-sky-400/30 bg-slate-950/90 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,.5)] backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-sky-300">
                    {t("controlTower.tour.step", {
                      index: (tourIndex ?? 0) + 1,
                      total: tourSteps.length,
                    })}
                  </div>
                  <h3 className="mt-0.5 text-sm font-semibold text-slate-100">{tourStep.title}</h3>
                  <div
                    className="ct-html mt-1 max-h-32 overflow-y-auto text-xs leading-relaxed text-slate-300"
                    dangerouslySetInnerHTML={{ __html: sanitizeStoryHtml(tourStep.body) }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => goToStep(null)}
                  className="text-slate-500 hover:text-slate-200"
                  aria-label={t("controlTower.close")}
                >
                  <CtIcon name="close" className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className={ctButton("ghost")}
                  disabled={tourIndex === 0}
                  onClick={() => goToStep(Math.max(0, (tourIndex ?? 0) - 1))}
                >
                  ‹ {t("controlTower.tour.prev")}
                </button>
                <button
                  type="button"
                  className={cn(ctButton("primary"), "ms-auto")}
                  onClick={() =>
                    (tourIndex ?? 0) + 1 < tourSteps.length
                      ? goToStep((tourIndex ?? 0) + 1)
                      : goToStep(null)
                  }
                >
                  {(tourIndex ?? 0) + 1 < tourSteps.length
                    ? t("controlTower.tour.next")
                    : t("controlTower.tour.finish")}{" "}
                  ›
                </button>
              </div>
            </div>
          ) : null}
          <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/85 p-1.5 shadow-[0_10px_40px_rgba(0,0,0,.4)] backdrop-blur-md">
            <button
              type="button"
              onClick={() => goToStep(tourIndex === null ? 0 : null)}
              className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-gradient-to-b from-sky-400 to-sky-500 text-sky-950"
              aria-label={
                tourIndex === null ? t("controlTower.tour.start") : t("controlTower.tour.stop")
              }
            >
              <CtIcon name={tourIndex === null ? "play" : "close"} className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {tourSteps.map((step, i) => {
                const state =
                  tourIndex === null
                    ? "idle"
                    : i < tourIndex
                      ? "done"
                      : i === tourIndex
                        ? "on"
                        : "idle";
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(i)}
                    className={cn(
                      "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11.5px] text-slate-400 hover:text-slate-200",
                      state === "on" && "bg-sky-500/15 text-sky-100",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-[18px] w-[18px] place-items-center rounded-full border border-white/15 font-mono text-[10px]",
                        state === "on" && "border-transparent bg-sky-400 text-sky-950",
                        state === "done" && "border-transparent bg-emerald-500/25 text-emerald-200",
                      )}
                    >
                      {state === "done" ? "✓" : i + 1}
                    </span>
                    {step.title}
                  </button>
                );
              })}
            </div>
            {config.tour.durationLabel ? (
              <span className="whitespace-nowrap border-s border-white/10 ps-2 pe-1 text-[11px] text-slate-500">
                {t("controlTower.tour.label")} · {config.tour.durationLabel}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ---- context panel ----------------------------------------------- */}
      <aside
        className="pointer-events-auto absolute bottom-3 end-3 top-14 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/85 shadow-[0_20px_60px_rgba(0,0,0,.45)] backdrop-blur-xl"
        style={{ width: PANEL_W }}
        aria-label={config.panelTitle}
      >
        <header className="flex items-start gap-2 border-b border-white/10 px-4 pb-2.5 pt-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              {panelMode === "ask"
                ? t("controlTower.ask.title")
                : panelMode === "explain"
                  ? String(selected?.properties.name ?? selected?.layerName ?? "")
                  : config.panelTitle}
            </h2>
            <p className="text-[11.5px] text-slate-400">
              {panelMode === "ask"
                ? t("controlTower.ask.subtitle")
                : panelMode === "explain"
                  ? selected?.layerName
                  : config.panelSubtitle}
            </p>
          </div>
          {panelMode !== "default" ? (
            <button
              type="button"
              onClick={() => (panelMode === "ask" ? setAskOpen(false) : clearSelection())}
              className="ms-auto text-slate-500 hover:text-slate-200"
              aria-label={t("controlTower.close")}
            >
              <CtIcon name="close" className="h-4 w-4" />
            </button>
          ) : null}
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
          {panelMode === "ask" ? (
            <AskPanel config={config} turns={askTurns} onAsk={ask} activeScenario={scenario} />
          ) : panelMode === "explain" && selected ? (
            <>
              <ExplainCard feature={selected} />
              <button
                type="button"
                className={cn(ctButton("ghost"), "self-start")}
                onClick={() => {
                  setAskOpen(true);
                }}
              >
                <CtIcon name="ask" className="h-4 w-4" /> {t("controlTower.explain.askWhy")}
              </button>
            </>
          ) : (
            <>
              {scenario.recommendation ? (
                <div className="rounded-xl border border-emerald-500/45 bg-gradient-to-b from-emerald-500/12 to-slate-900/60 px-3 py-2.5">
                  <h3 className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <Tag tone="good">{t("controlTower.recommended")}</Tag>
                    {scenario.recommendation.title}
                  </h3>
                  <div
                    className="ct-html mt-1 text-xs leading-relaxed text-slate-300"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeStoryHtml(scenario.recommendation.body),
                    }}
                  />
                  {scenario.recommendation.scenarioId ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className={ctButton("good")}
                        onClick={() => selectScenario(scenario.recommendation!.scenarioId!)}
                      >
                        {scenario.recommendation.actionLabel ?? t("controlTower.previewOnMap")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {scenario.exceptions.length ? (
                <div className="flex flex-col gap-1.5">
                  <SectionTitle
                    count={t("controlTower.exceptions.count", {
                      count: scenario.exceptions.length,
                    })}
                  >
                    {t("controlTower.exceptions.title")}
                  </SectionTitle>
                  {exceptions.map((e) => (
                    <ListRow key={e.id} row={exceptionToRow(e)} onFly={flyToPoint} />
                  ))}
                  {scenario.exceptions.length > 6 ? (
                    <button
                      type="button"
                      className={cn(ctButton("ghost"), "self-start text-slate-400")}
                      onClick={() => setShowAllExceptions((v) => !v)}
                    >
                      {showAllExceptions
                        ? t("controlTower.exceptions.showFewer")
                        : t("controlTower.exceptions.showMore", {
                            count: scenario.exceptions.length - 6,
                          })}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {config.sections.map((section, i) => (
                <Section key={i} section={section} onFly={flyToPoint} />
              ))}
            </>
          )}
        </div>
        {config.dataNotice && panelMode === "default" ? (
          <footer className="border-t border-white/10 px-4 py-2 text-[10.5px] leading-snug text-slate-500">
            {config.dataNotice}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
