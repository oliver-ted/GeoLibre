import { act, fireEvent, render, screen } from "./helpers/dom";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { parseProject } from "@geolibre/core";
import { DEMO_PROJECTS } from "../apps/geolibre-desktop/src/lib/demo-projects";
import { withProjectUrlParam } from "../apps/geolibre-desktop/src/lib/project-url";

// Loaded after the harness so its CSS imports and Vite globals are handled.
const { DemosMenu, resolveDemoUrl } =
  await import("../apps/geolibre-desktop/src/components/layout/toolbar/DemosMenu");

const BASE_URL = "https://app.example/geoverse/";
const PUBLIC_DIR = new URL("../apps/geolibre-desktop/public/", import.meta.url);

const chrome = {
  buttonClass: "",
  buttonSize: "sm" as const,
  iconClassName: "",
  renderLabel: (label: string) => label,
};

/** Render the menu and open its dropdown the way a keyboard user would. */
function openMenu(onOpenProjectUrl: (url: string) => void): void {
  render(createElement(DemosMenu, { chrome, onOpenProjectUrl, baseUrl: BASE_URL }));
  const trigger = screen.getByRole("button", { name: "Demos" });
  act(() => {
    fireEvent.keyDown(trigger, { key: "Enter" });
  });
}

describe("DemosMenu", () => {
  it("lists every configured demo project by name, in order", () => {
    openMenu(() => {});
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    assert.deepEqual(
      items,
      DEMO_PROJECTS.map((demo) => demo.name),
    );
  });

  it("heads each group of demos with its section name, in order", () => {
    openMenu(() => {});
    const groups = [...new Set(DEMO_PROJECTS.map((demo) => demo.group))];
    for (const group of groups) assert.ok(screen.getByText(group), `missing heading ${group}`);
  });

  it("hands a bundled demo's URL, resolved against the app, to the URL loader", () => {
    const opened: string[] = [];
    openMenu((url) => opened.push(url));
    const demo = DEMO_PROJECTS.find((entry) => !/^https?:/.test(entry.url))!;
    act(() => {
      fireEvent.click(screen.getByRole("menuitem", { name: demo.name }));
    });
    assert.deepEqual(opened, [`${BASE_URL}${demo.url}`]);
  });

  it("passes an absolute demo URL through unchanged", () => {
    const opened: string[] = [];
    openMenu((url) => opened.push(url));
    const demo = DEMO_PROJECTS.find((entry) => /^https?:/.test(entry.url))!;
    act(() => {
      fireEvent.click(screen.getByRole("menuitem", { name: demo.name }));
    });
    assert.deepEqual(opened, [demo.url]);
  });
});

describe("resolveDemoUrl", () => {
  it("resolves app-relative paths under a sub-path base and leaves absolute URLs alone", () => {
    assert.equal(
      resolveDemoUrl("demos/nova/a.geolibre.json", "https://host.example/app/"),
      "https://host.example/app/demos/nova/a.geolibre.json",
    );
    assert.equal(
      resolveDemoUrl("https://share.example/b.geolibre.json", "https://host.example/app/"),
      "https://share.example/b.geolibre.json",
    );
  });
});

describe("bundled demo projects", () => {
  for (const demo of DEMO_PROJECTS.filter((entry) => !/^https?:/.test(entry.url))) {
    it(`${demo.url} exists and parses as a project`, () => {
      const file = new URL(demo.url, PUBLIC_DIR);
      assert.ok(existsSync(file), `missing ${demo.url} under public/`);
      const project = parseProject(readFileSync(file, "utf8"));
      assert.ok(project.layers.length > 0);
    });
  }
});

describe("withProjectUrlParam", () => {
  it("sets ?url= and drops the other project-URL aliases, keeping other state", () => {
    const next = withProjectUrlParam(
      "https://app.example/?project=https%3A%2F%2Fold.example%2Fa.json&locale=es#map",
      "https://share.example/b.geolibre.json",
    );
    const parsed = new URL(next);
    assert.equal(parsed.searchParams.get("url"), "https://share.example/b.geolibre.json");
    assert.equal(parsed.searchParams.get("project"), null);
    assert.equal(parsed.searchParams.get("locale"), "es");
    assert.equal(parsed.hash, "#map");
  });
});
