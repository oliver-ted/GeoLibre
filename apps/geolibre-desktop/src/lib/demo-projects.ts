/**
 * Projects listed in the toolbar's Demos menu, in menu order.
 *
 * Each entry is a display name and the URL of a `.geolibre.json` project.
 * Choosing one opens it exactly like Project → Open From → URL. To add or
 * remove a demo, edit this list only.
 */
export interface DemoProject {
  /** Shown as-is in the menu (a proper title, so it is not translated). */
  name: string;
  /** Absolute http(s) URL of the project file. */
  url: string;
}

export const DEMO_PROJECTS: readonly DemoProject[] = [
  {
    name: "Manhattan Buildings Through Time",
    url: "https://share.geolibre.app/giswqs/manhattan-buildings-through-time.geolibre.json",
  },
  {
    name: "NYC Subway Ridership 2025",
    url: "https://share.geolibre.app/giswqs/nyc-subway-ridership-2025.geolibre.json",
  },
  {
    name: "NYC Traffic Crashes 2025",
    url: "https://share.geolibre.app/giswqs/nyc-traffic-crashes-2025.geolibre.json",
  },
  {
    name: "NYC Citi Bike Live Availability",
    url: "https://share.geolibre.app/giswqs/nyc-citi-bike-live-availability.geolibre.json",
  },
];
