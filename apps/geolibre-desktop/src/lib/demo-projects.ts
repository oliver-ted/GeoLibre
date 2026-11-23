/**
 * Projects listed in the toolbar's Demos menu, in menu order.
 *
 * Each entry is a display name, the menu section it appears under, and the
 * project's URL: either an absolute http(s) URL, or a path relative to the
 * app (such as `demos/nova/…`) for project files bundled under
 * `apps/geolibre-desktop/public/`. Choosing one opens it exactly like
 * Project → Open From → URL. To add or remove a demo, edit this list only.
 */
export interface DemoProject {
  /** Shown as-is in the menu (a proper title, so it is not translated). */
  name: string;
  /** Menu section heading; entries sharing a group are listed together. */
  group: string;
  /** Absolute http(s) URL, or a path relative to the app's base URL. */
  url: string;
}

export const DEMO_PROJECTS: readonly DemoProject[] = [
  {
    name: "1 · Global Network",
    group: "Nova Biomedical (sample data)",
    url: "demos/nova/1-nova-global-network.geolibre.json",
  },
  {
    name: "2 · Optimal Source vs Nearest",
    group: "Nova Biomedical (sample data)",
    url: "demos/nova/2-nova-optimal-sourcing.geolibre.json",
  },
  {
    name: "3 · New England Van Routes",
    group: "Nova Biomedical (sample data)",
    url: "demos/nova/3-nova-new-england-routes.geolibre.json",
  },
  {
    name: "4 · Supplier Lane Risk",
    group: "Nova Biomedical (sample data)",
    url: "demos/nova/4-nova-supplier-risk.geolibre.json",
  },
  {
    name: "5 · What If Billerica Goes Down?",
    group: "Nova Biomedical (sample data)",
    url: "demos/nova/5-nova-billerica-outage.geolibre.json",
  },
  {
    name: "6 · Installed Base & Consumables Demand",
    group: "Nova Biomedical (sample data)",
    url: "demos/nova/6-nova-installed-base.geolibre.json",
  },
  {
    name: "Manhattan Buildings Through Time",
    group: "New York City",
    url: "https://share.geolibre.app/giswqs/manhattan-buildings-through-time.geolibre.json",
  },
  {
    name: "NYC Subway Ridership 2025",
    group: "New York City",
    url: "https://share.geolibre.app/giswqs/nyc-subway-ridership-2025.geolibre.json",
  },
  {
    name: "NYC Traffic Crashes 2025",
    group: "New York City",
    url: "https://share.geolibre.app/giswqs/nyc-traffic-crashes-2025.geolibre.json",
  },
  {
    name: "NYC Citi Bike Live Availability",
    group: "New York City",
    url: "https://share.geolibre.app/giswqs/nyc-citi-bike-live-availability.geolibre.json",
  },
];
