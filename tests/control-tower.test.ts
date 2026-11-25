import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseProject } from "@geolibre/core";
import {
  formatKpi,
  kpiDelta,
  parseAlternatives,
  readControlTowerConfig,
} from "../apps/geolibre-desktop/src/lib/control-tower";
import { matchAskItem } from "../apps/geolibre-desktop/src/components/control-tower/ControlTowerPanel";
import { DEMO_PROJECTS } from "../apps/geolibre-desktop/src/lib/demo-projects";

const PUBLIC_DIR = new URL("../apps/geolibre-desktop/public/", import.meta.url);
const NOVA = DEMO_PROJECTS.filter((d) => d.url.startsWith("demos/nova/"));

describe("readControlTowerConfig", () => {
  it("ignores projects without a config or with the wrong version", () => {
    assert.equal(readControlTowerConfig({}), null);
    assert.equal(readControlTowerConfig(undefined), null);
    assert.equal(readControlTowerConfig({ controlTower: { version: 2 } }), null);
    assert.equal(
      readControlTowerConfig({
        controlTower: { version: 1, scenarios: [], lenses: [], lensId: "x" },
      }),
      null,
    );
  });

  it("fills defaults for optional sections", () => {
    const config = readControlTowerConfig({
      controlTower: {
        version: 1,
        lensId: "a",
        lenses: [{ id: "a", label: "A", url: "a.json", icon: "network" }],
        scenarios: [{ id: "s", label: "S", tone: "normal", layers: {}, kpis: [], exceptions: [] }],
      },
    });
    assert.ok(config);
    assert.equal(config.defaultScenarioId, "s");
    assert.deepEqual(config.views, []);
    assert.deepEqual(config.tour.steps, []);
    assert.deepEqual(config.ask.items, []);
  });
});

describe("KPI helpers", () => {
  it("formats by kind", () => {
    assert.equal(formatKpi({ value: 97.87, format: "pct" }), "97.9%");
    assert.equal(formatKpi({ value: 1.22, format: "days" }), "1.2");
    assert.equal(formatKpi({ value: 33665.4, format: "usd" }), "$33,665");
    assert.equal(formatKpi({ value: 4265.5, format: "kg" }), "4,266");
  });

  it("flags the bad direction per KPI", () => {
    const sla = { id: "sla", label: "", value: 46.8, format: "pct" as const };
    const base = { ...sla, value: 97.9 };
    assert.deepEqual(kpiDelta(sla, base), { pct: -52, bad: true });
    const freight = {
      id: "f",
      label: "",
      value: 131526,
      format: "usd" as const,
      higherIsWorse: true,
    };
    assert.deepEqual(kpiDelta(freight, { ...freight, value: 33665 }), { pct: 291, bad: true });
    assert.equal(kpiDelta(freight, undefined), null);
    assert.equal(kpiDelta(freight, { ...freight, value: 131526 }), null);
  });

  it("parses the alternatives feature property defensively", () => {
    assert.deepEqual(parseAlternatives(undefined), []);
    assert.deepEqual(parseAlternatives("not json"), []);
    assert.equal(parseAlternatives('[{"node":"BIL-E"}]').length, 1);
  });
});

describe("matchAskItem", () => {
  const items = [
    { question: "Which customers miss SLA if Billerica is down?", answer: "<p>25 customers</p>" },
    { question: "Why isn't Boston served from Norwood?", answer: "<p>Osmolality only</p>" },
  ];
  it("matches on shared words and gives up on unrelated input", () => {
    assert.equal(matchAskItem("customers missing SLA when billerica goes down", items), items[0]);
    assert.equal(matchAskItem("boston norwood", items), items[1]);
    assert.equal(matchAskItem("hello", items), null);
  });
});

describe("Nova demo projects", () => {
  it("every Nova demo carries a valid Control Tower config for its own lens", () => {
    assert.equal(NOVA.length, 6);
    for (const demo of NOVA) {
      const project = parseProject(readFileSync(new URL(demo.url, PUBLIC_DIR), "utf8"));
      const config = readControlTowerConfig(project.metadata);
      assert.ok(config, `${demo.url} has no controlTower config`);
      assert.equal(config.lenses.length, 6);
      assert.ok(
        config.lenses.some((l) => l.id === config.lensId),
        `${demo.url} lens not listed`,
      );
      // Scenario-managed layers must exist in the file.
      const ids = new Set(project.layers.map((l) => l.id));
      for (const scenario of config.scenarios) {
        for (const id of Object.keys(scenario.layers)) assert.ok(ids.has(id), `${demo.url}: ${id}`);
        assert.ok(scenario.kpis.length >= 6, `${demo.url}: ${scenario.id} KPIs`);
      }
      for (const id of config.explainLayers) assert.ok(ids.has(id), `${demo.url}: explain ${id}`);
      for (const step of config.tour.steps)
        for (const id of Object.keys(step.layers ?? {}))
          assert.ok(ids.has(id), `${demo.url}: tour ${id}`);
      assert.ok(config.tour.steps.length >= 4);
      assert.ok(config.ask.items.length >= 4);
      // The shell owns the tour and KPIs, so the file has no story-map or dashboard.
      assert.ok(!project.storymap);
      assert.ok(!project.widgets?.length);
      assert.notEqual(project.legend?.panelVisible, true);
    }
  });

  it("the sourcing scenarios reproduce the solution design's headline cases", () => {
    const project = parseProject(
      readFileSync(new URL("demos/nova/2-nova-optimal-sourcing.geoverse.json", PUBLIC_DIR), "utf8"),
    );
    const config = readControlTowerConfig(project.metadata)!;
    assert.deepEqual(
      config.scenarios.map((s) => s.id),
      ["normal", "outage", "contingency", "wimborne"],
    );
    const normal = config.scenarios[0];
    const sla = normal.kpis.find((k) => k.id === "sla")!;
    assert.equal(sla.value.toFixed(1), "97.9");
    assert.equal(normal.exceptions.filter((e) => e.badge === "SLA").length, 1);
    assert.equal(normal.exceptions.find((e) => e.badge === "SLA")?.title, "Seoul, South Korea");
    const customers = project.layers.find((l) => l.id === "d2-customers")!;
    const boston = customers.geojson!.features.find((f) => f.properties?.name === "Boston, MA")!;
    assert.equal(boston.properties!.nearest_node, "NOR");
    assert.equal(boston.properties!.served_from, "BIL-E");
    const alts = parseAlternatives(boston.properties!.alternatives);
    assert.equal(alts.find((a) => a.status === "chosen")?.node, "BIL-E");
    assert.ok(alts.some((a) => a.node === "NOR" && a.status === "no stock"));
  });

  it("no demo text mentions the upstream product name", () => {
    for (const demo of NOVA) {
      const text = readFileSync(new URL(demo.url, PUBLIC_DIR), "utf8");
      assert.ok(!/geolibre/i.test(text), `${demo.url} mentions the upstream name`);
      assert.ok(
        demo.url.endsWith(".geoverse.json"),
        `${demo.url} should use the Geoverse extension`,
      );
    }
  });
});
