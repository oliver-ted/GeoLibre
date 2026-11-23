import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geolibre/ui";
import { Map as MapIcon, Presentation } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { DEMO_PROJECTS, type DemoProject } from "../../../lib/demo-projects";
import type { ToolbarChrome } from "./constants";

interface DemosMenuProps {
  chrome: ToolbarChrome;
  /** Opens a project URL through the Open From → URL loader. */
  onOpenProjectUrl: (url: string) => void;
  /** The listed projects; defaults to the configured {@link DEMO_PROJECTS}. */
  demos?: readonly DemoProject[];
  /** Base a relative demo URL resolves against; defaults to the app's base URL. */
  baseUrl?: string;
}

/** The app's own base URL (where bundled `public/` files are served). */
function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.href).toString();
}

/**
 * Resolves a demo's URL: absolute URLs pass through, and a relative path (a
 * project bundled under `public/`) resolves against `baseUrl`.
 */
export function resolveDemoUrl(url: string, baseUrl: string): string {
  return new URL(url, baseUrl).toString();
}

/** Groups demos by section, keeping the configured order of sections and entries. */
function groupDemos(demos: readonly DemoProject[]): Array<[string, DemoProject[]]> {
  const groups = new Map<string, DemoProject[]>();
  for (const demo of demos) {
    const entries = groups.get(demo.group) ?? [];
    entries.push(demo);
    groups.set(demo.group, entries);
  }
  return [...groups.entries()];
}

/** The Demos menu: one click opens a preset project from `lib/demo-projects.ts`. */
export function DemosMenu({
  chrome,
  onOpenProjectUrl,
  demos = DEMO_PROJECTS,
  baseUrl,
}: DemosMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={chrome.buttonClass}
          variant="ghost"
          size={chrome.buttonSize}
          aria-label={t("toolbar.menu.demos")}
        >
          <Presentation className={chrome.iconClassName} />
          {chrome.renderLabel(t("toolbar.menu.demos"))}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {groupDemos(demos).map(([group, entries], index) => (
          <Fragment key={group}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{group}</DropdownMenuLabel>
            {entries.map((demo) => (
              <DropdownMenuItem
                key={demo.url}
                onSelect={() => onOpenProjectUrl(resolveDemoUrl(demo.url, baseUrl ?? appBaseUrl()))}
              >
                <MapIcon className="me-2 h-3.5 w-3.5" />
                {demo.name}
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
