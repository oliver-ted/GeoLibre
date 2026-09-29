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
import { useTranslation } from "react-i18next";
import { DEMO_PROJECTS, type DemoProject } from "../../../lib/demo-projects";
import type { ToolbarChrome } from "./constants";

interface DemosMenuProps {
  chrome: ToolbarChrome;
  /** Opens a project URL through the Open From → URL loader. */
  onOpenProjectUrl: (url: string) => void;
  /** The listed projects; defaults to the configured {@link DEMO_PROJECTS}. */
  demos?: readonly DemoProject[];
}

/** The Demos menu: one click opens a preset project from `lib/demo-projects.ts`. */
export function DemosMenu({ chrome, onOpenProjectUrl, demos = DEMO_PROJECTS }: DemosMenuProps) {
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
        <DropdownMenuLabel>{t("toolbar.menu.demos")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {demos.map((demo) => (
          <DropdownMenuItem key={demo.url} onSelect={() => onOpenProjectUrl(demo.url)}>
            <MapIcon className="me-2 h-3.5 w-3.5" />
            {demo.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
