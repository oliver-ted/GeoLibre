import { act, fireEvent, render, screen } from "./helpers/dom";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { DEMO_PROJECTS } from "../apps/geolibre-desktop/src/lib/demo-projects";
import { withProjectUrlParam } from "../apps/geolibre-desktop/src/lib/project-url";

// Loaded after the harness so its CSS imports and Vite globals are handled.
const { DemosMenu } =
  await import("../apps/geolibre-desktop/src/components/layout/toolbar/DemosMenu");

const chrome = {
  buttonClass: "",
  buttonSize: "sm" as const,
  iconClassName: "",
  renderLabel: (label: string) => label,
};

/** Render the menu and open its dropdown the way a keyboard user would. */
function openMenu(onOpenProjectUrl: (url: string) => void): void {
  render(createElement(DemosMenu, { chrome, onOpenProjectUrl }));
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

  it("hands the chosen project's URL to the URL loader", () => {
    const opened: string[] = [];
    openMenu((url) => opened.push(url));
    const demo = DEMO_PROJECTS[1];
    act(() => {
      fireEvent.click(screen.getByRole("menuitem", { name: demo.name }));
    });
    assert.deepEqual(opened, [demo.url]);
  });
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
