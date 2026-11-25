/**
 * Generates the Nova Biomedical demo projects served from
 * apps/geolibre-desktop/public/demos/nova/ and listed in the Demos menu.
 *
 *   node --import tsx scripts/gen-nova-demos.ts
 *
 * Everything here is ILLUSTRATIVE SAMPLE DATA for a sales demo. Site names and
 * approximate locations follow the Crawford Software "Geoverse Supply Chain
 * Control Tower" solution design (Nov 2026); customers, suppliers, volumes,
 * rates and installed-base figures are invented. The sourcing, mode, SLA and
 * route numbers are computed below with the rules from Section 6 of that
 * document, so every arc, flag and KPI in a demo comes from one model.
 *
 * Layers are built with the app's own factories (core defaults and the deck.gl
 * builder) and every file is round-tripped through `parseProject` before it is
 * written, so the output is exactly what the app itself would save.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Feature, FeatureCollection } from "geojson";
import {
  createEmptyProject,
  DEFAULT_LAYER_STYLE,
  parseProject,
  serializeProject,
  type DashboardWidget,
  type GeoLibreLayer,
  type GeoLibreProject,
  type LayerStyle,
  type StoryChapter,
} from "../packages/core/src/index";
import { createDeckVizStoreLayer } from "../packages/plugins/src/plugins/deckgl-viz/store-layer";
import type {
  ControlTowerConfig,
  CtAskItem,
  CtException,
  CtKpi,
  CtLens,
  CtScenario,
  CtSection,
  CtTourStep,
} from "../apps/geolibre-desktop/src/lib/control-tower";

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/geolibre-desktop/public/demos/nova",
);
const DARK_BASEMAP = "https://tiles.openfreemap.org/styles/dark";

// ---------------------------------------------------------------------------
// Sample network (Crawford solution design §3, §7; customers/suppliers invented)
// ---------------------------------------------------------------------------

type Family = "CC" | "OSM" | "LHQ" | "BIO";
type Region = "NA" | "EU" | "APAC" | "LATAM";
type SiteType = "Manufacturing" | "Distribution center" | "Forward stocking" | "Office";

const FAMILY_NAME: Record<Family, string> = {
  CC: "Critical Care & POC",
  OSM: "Osmolality & lab instruments",
  LHQ: "Liquid-handling QC",
  BIO: "Bioprocess & cell-line",
};
const FAMILY_COLOR: Record<Family, string> = {
  CC: "#38bdf8",
  OSM: "#a78bfa",
  LHQ: "#34d399",
  BIO: "#fb923c",
};
const SITE_TYPE_COLOR: Record<SiteType, string> = {
  Manufacturing: "#e5e7eb",
  "Distribution center": "#0ea5e9",
  "Forward stocking": "#14b8a6",
  Office: "#64748b",
};

interface Site {
  code: string;
  name: string;
  type: SiteType;
  country: string;
  lat: number;
  lng: number;
  erp: number;
  crm: number;
  role: string;
  /** Families this node ships (empty for plants/offices). */
  ships: Family[];
  /** Countries it may serve; null = any country. */
  serves: string[] | null;
  /** Node handling cost per shipment (USD). */
  handling: number;
}

const US_DC_HANDLING = 4;
const SITES: Site[] = [
  {
    code: "WAL",
    name: "Waltham – Prospect St (HQ & Mfg)",
    type: "Manufacturing",
    country: "US",
    lat: 42.3795,
    lng: -71.2395,
    erp: 118,
    crm: 89,
    role: "HQ; makes Critical Care & Bioprocess",
    ships: [],
    serves: null,
    handling: 0,
  },
  {
    code: "BIL-E",
    name: "Billerica – Enterprise Rd (Distribution)",
    type: "Distribution center",
    country: "US",
    lat: 42.5585,
    lng: -71.2695,
    erp: 42,
    crm: 1,
    role: "Main DC; ships Critical Care & Bioprocess",
    ships: ["CC", "BIO"],
    serves: null,
    handling: US_DC_HANDLING,
  },
  {
    code: "BIL-M",
    name: "Billerica – Manning Rd (Mfg & Warehouse)",
    type: "Manufacturing",
    country: "US",
    lat: 42.5365,
    lng: -71.2405,
    erp: 17,
    crm: 6,
    role: "Makes Critical Care test strips",
    ships: [],
    serves: null,
    handling: 0,
  },
  {
    code: "BIL-L",
    name: "Billerica – Lexington Rd (Mfg)",
    type: "Manufacturing",
    country: "US",
    lat: 42.5195,
    lng: -71.2755,
    erp: 36,
    crm: 4,
    role: "Makes Critical Care",
    ships: [],
    serves: null,
    handling: 0,
  },
  {
    code: "NOR",
    name: "Norwood – Technology Way (Mfg & DC)",
    type: "Distribution center",
    country: "US",
    lat: 42.1735,
    lng: -71.1985,
    erp: 71,
    crm: 39,
    role: "Ships Osmolality & lab instruments",
    ships: ["OSM"],
    serves: null,
    handling: 5,
  },
  {
    code: "WES",
    name: "Westbrook, ME (Mfg & DC)",
    type: "Distribution center",
    country: "US",
    lat: 43.677,
    lng: -70.371,
    erp: 27,
    crm: 26,
    role: "Ships Liquid-handling QC",
    ships: ["LHQ"],
    serves: null,
    handling: 5,
  },
  {
    code: "WIM",
    name: "Wimborne / Ferndown, UK (Mfg & EU Hub)",
    type: "Distribution center",
    country: "UK",
    lat: 50.805,
    lng: -1.915,
    erp: 31,
    crm: 79,
    role: "EU hub; ships all four families",
    ships: ["CC", "OSM", "LHQ", "BIO"],
    serves: null,
    handling: 5,
  },
  {
    code: "TPE",
    name: "Taipei, Taiwan (Mfg)",
    type: "Manufacturing",
    country: "TW",
    lat: 25.033,
    lng: 121.565,
    erp: 0,
    crm: 0,
    role: "Makes Critical Care",
    ships: [],
    serves: null,
    handling: 0,
  },
  {
    code: "BRA",
    name: "Nova Lima, Brazil (Subsidiary & FSL)",
    type: "Forward stocking",
    country: "BR",
    lat: -19.985,
    lng: -43.847,
    erp: 0,
    crm: 20,
    role: "Ships Critical Care to Brazil",
    ships: ["CC"],
    serves: ["BR"],
    handling: 8,
  },
  {
    code: "CAN",
    name: "Ontario, Canada (Subsidiary & FSL)",
    type: "Forward stocking",
    country: "CA",
    lat: 43.589,
    lng: -79.644,
    erp: 6,
    crm: 36,
    role: "Ships Critical Care to Canada",
    ships: ["CC"],
    serves: ["CA"],
    handling: 8,
  },
  {
    code: "GER",
    name: "Germany (Subsidiary & FSL)",
    type: "Forward stocking",
    country: "DE",
    lat: 49.99,
    lng: 8.567,
    erp: 7,
    crm: 52,
    role: "Ships Critical Care to DE, FR, IT, CH, NL, ES",
    ships: ["CC"],
    serves: ["DE", "FR", "IT", "CH", "NL", "ES"],
    handling: 8,
  },
  {
    code: "FRA",
    name: "France (Subsidiary)",
    type: "Office",
    country: "FR",
    lat: 48.682,
    lng: 2.169,
    erp: 6,
    crm: 50,
    role: "Sales & service office",
    ships: [],
    serves: null,
    handling: 0,
  },
  {
    code: "ITA",
    name: "Italy (Subsidiary)",
    type: "Office",
    country: "IT",
    lat: 45.57,
    lng: 9.03,
    erp: 6,
    crm: 27,
    role: "Sales & service office",
    ships: [],
    serves: null,
    handling: 0,
  },
  {
    code: "JPN",
    name: "Japan (Subsidiary & FSL)",
    type: "Forward stocking",
    country: "JP",
    lat: 35.658,
    lng: 139.751,
    erp: 7,
    crm: 31,
    role: "Ships Critical Care to Japan",
    ships: ["CC"],
    serves: ["JP"],
    handling: 8,
  },
  {
    code: "AUS",
    name: "Australia – Chatswood (Subsidiary & FSL)",
    type: "Forward stocking",
    country: "AU",
    lat: -33.797,
    lng: 151.183,
    erp: 4,
    crm: 17,
    role: "Ships Critical Care to Australia",
    ships: ["CC"],
    serves: ["AU"],
    handling: 8,
  },
];
const siteByCode = (code: string): Site => {
  const site = SITES.find((s) => s.code === code);
  if (!site) throw new Error(`Unknown site ${code}`);
  return site;
};

const REGION_OF: Record<string, Region> = {
  US: "NA",
  CA: "NA",
  MX: "NA",
  UK: "EU",
  DE: "EU",
  FR: "EU",
  IT: "EU",
  NL: "EU",
  CH: "EU",
  ES: "EU",
  IE: "EU",
  JP: "APAC",
  KR: "APAC",
  AU: "APAC",
  TW: "APAC",
  CN: "APAC",
  MY: "APAC",
  BR: "LATAM",
};

type Segment = "Hospital" | "Reference lab" | "Biopharma";
interface Customer {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  segment: Segment;
  family: Family;
  weekly: number;
}

const CUSTOMER_ROWS: Array<[string, string, number, number, Segment, Family, number]> = [
  ["Boston, MA", "US", 42.3601, -71.0589, "Hospital", "CC", 40],
  ["Cambridge, MA", "US", 42.3736, -71.1097, "Biopharma", "BIO", 22],
  ["Lexington, MA", "US", 42.4473, -71.2245, "Biopharma", "BIO", 12],
  ["Worcester, MA", "US", 42.2626, -71.8023, "Hospital", "CC", 18],
  ["Providence, RI", "US", 41.824, -71.4128, "Hospital", "CC", 16],
  ["Hartford, CT", "US", 41.7658, -72.6734, "Hospital", "CC", 14],
  ["Manchester, NH", "US", 42.9956, -71.4548, "Hospital", "CC", 10],
  ["Portland, ME", "US", 43.6591, -70.2568, "Hospital", "CC", 12],
  ["New York, NY", "US", 40.7128, -74.006, "Hospital", "CC", 45],
  ["Philadelphia, PA", "US", 39.9526, -75.1652, "Hospital", "CC", 30],
  ["Baltimore, MD", "US", 39.2904, -76.6122, "Hospital", "CC", 22],
  ["Washington, DC", "US", 38.9072, -77.0369, "Reference lab", "OSM", 10],
  ["Pittsburgh, PA", "US", 40.4406, -79.9959, "Hospital", "CC", 14],
  ["Cleveland, OH", "US", 41.4993, -81.6944, "Hospital", "CC", 20],
  ["Chicago, IL", "US", 41.8781, -87.6298, "Hospital", "CC", 36],
  ["Detroit, MI", "US", 42.3314, -83.0458, "Reference lab", "LHQ", 8],
  ["Minneapolis, MN", "US", 44.9778, -93.265, "Hospital", "CC", 15],
  ["Atlanta, GA", "US", 33.749, -84.388, "Hospital", "CC", 24],
  ["Miami, FL", "US", 25.7617, -80.1918, "Hospital", "CC", 18],
  ["Nashville, TN", "US", 36.1627, -86.7816, "Hospital", "CC", 14],
  ["Houston, TX", "US", 29.7604, -95.3698, "Hospital", "CC", 30],
  ["Dallas, TX", "US", 32.7767, -96.797, "Reference lab", "OSM", 12],
  ["Denver, CO", "US", 39.7392, -104.9903, "Hospital", "CC", 14],
  ["Phoenix, AZ", "US", 33.4484, -112.074, "Hospital", "CC", 15],
  ["Los Angeles, CA", "US", 34.0522, -118.2437, "Hospital", "CC", 34],
  ["San Diego, CA", "US", 32.7157, -117.1611, "Biopharma", "BIO", 18],
  ["San Francisco, CA", "US", 37.7749, -122.4194, "Biopharma", "BIO", 22],
  ["Seattle, WA", "US", 47.6062, -122.3321, "Hospital", "CC", 16],
  ["Research Triangle, NC", "US", 35.994, -78.8986, "Biopharma", "BIO", 16],
  ["St. Louis, MO", "US", 38.627, -90.1994, "Reference lab", "LHQ", 8],
  ["Toronto, ON", "CA", 43.6532, -79.3832, "Hospital", "CC", 18],
  ["Montreal, QC", "CA", 45.5017, -73.5673, "Hospital", "CC", 12],
  ["Vancouver, BC", "CA", 49.2827, -123.1207, "Hospital", "CC", 10],
  ["London, UK", "UK", 51.5074, -0.1278, "Hospital", "CC", 20],
  ["Manchester, UK", "UK", 53.4808, -2.2426, "Reference lab", "OSM", 8],
  ["Frankfurt, Germany", "DE", 50.1109, 8.6821, "Hospital", "CC", 16],
  ["Munich, Germany", "DE", 48.1351, 11.582, "Biopharma", "BIO", 10],
  ["Paris, France", "FR", 48.8566, 2.3522, "Hospital", "CC", 18],
  ["Milan, Italy", "IT", 45.4642, 9.19, "Hospital", "CC", 14],
  ["Leiden, Netherlands", "NL", 52.1601, 4.497, "Biopharma", "BIO", 10],
  ["Basel, Switzerland", "CH", 47.5596, 7.5886, "Biopharma", "BIO", 12],
  ["Madrid, Spain", "ES", 40.4168, -3.7038, "Hospital", "CC", 12],
  ["Tokyo, Japan", "JP", 35.6762, 139.6503, "Hospital", "CC", 16],
  ["Osaka, Japan", "JP", 34.6937, 135.5023, "Reference lab", "OSM", 6],
  ["Seoul, South Korea", "KR", 37.5665, 126.978, "Hospital", "CC", 8],
  ["Sydney, Australia", "AU", -33.8688, 151.2093, "Hospital", "CC", 10],
  ["São Paulo, Brazil", "BR", -23.5505, -46.6333, "Hospital", "CC", 10],
];
/**
 * Scales the relative volumes above so normal-operations weekly freight lands
 * near the $33,712 in the solution design's prototype results (§7.1).
 */
const VOLUME_SCALE = 0.387;
const CUSTOMERS: Customer[] = CUSTOMER_ROWS.map(
  ([name, country, lat, lng, segment, family, weekly], i) => ({
    id: `C${String(i + 1).padStart(2, "0")}`,
    name,
    country,
    lat,
    lng,
    segment,
    family,
    weekly: Math.max(2, Math.round(weekly * VOLUME_SCALE)),
  }),
);
const customerByName = (name: string): Customer => {
  const customer = CUSTOMERS.find((c) => c.name === name);
  if (!customer) throw new Error(`Unknown customer ${name}`);
  return customer;
};

interface Supplier {
  material: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  to: string;
  mode: "Ocean" | "Ground";
  days: number;
  singleSource: boolean;
  weekly: number;
}
const SUPPLIERS: Supplier[] = [
  {
    material: "Electronic PCB assemblies",
    city: "Penang, Malaysia",
    country: "MY",
    lat: 5.4141,
    lng: 100.3288,
    to: "BIL-M",
    mode: "Ocean",
    days: 39,
    singleSource: true,
    weekly: 6,
  },
  {
    material: "Sensor chips",
    city: "Hsinchu, Taiwan",
    country: "TW",
    lat: 24.8138,
    lng: 120.9675,
    to: "WAL",
    mode: "Ocean",
    days: 36,
    singleSource: true,
    weekly: 4,
  },
  {
    material: "Injection-molded plastics",
    city: "Leominster, MA",
    country: "US",
    lat: 42.5251,
    lng: -71.7598,
    to: "BIL-L",
    mode: "Ground",
    days: 1,
    singleSource: false,
    weekly: 20,
  },
  {
    material: "Reagent chemicals",
    city: "St. Louis, MO",
    country: "US",
    lat: 38.627,
    lng: -90.1994,
    to: "WAL",
    mode: "Ground",
    days: 3,
    singleSource: false,
    weekly: 12,
  },
  {
    material: "Glass vials & calibration fluids",
    city: "Vineland, NJ",
    country: "US",
    lat: 39.4864,
    lng: -75.0257,
    to: "BIL-L",
    mode: "Ground",
    days: 1,
    singleSource: false,
    weekly: 14,
  },
  {
    material: "Packaging & corrugate",
    city: "Nashua, NH",
    country: "US",
    lat: 42.7654,
    lng: -71.4676,
    to: "BIL-E",
    mode: "Ground",
    days: 1,
    singleSource: false,
    weekly: 25,
  },
  {
    material: "Precision optics",
    city: "Rochester, NY",
    country: "US",
    lat: 43.1566,
    lng: -77.6088,
    to: "NOR",
    mode: "Ground",
    days: 1,
    singleSource: true,
    weekly: 5,
  },
  {
    material: "Thermoelectric modules",
    city: "Dayton, OH",
    country: "US",
    lat: 39.7589,
    lng: -84.1916,
    to: "NOR",
    mode: "Ground",
    days: 2,
    singleSource: false,
    weekly: 6,
  },
  {
    material: "Photometric dyes",
    city: "Lewiston, ME",
    country: "US",
    lat: 44.1004,
    lng: -70.2148,
    to: "WES",
    mode: "Ground",
    days: 1,
    singleSource: true,
    weekly: 4,
  },
  {
    material: "Labware & pipette tips",
    city: "Tijuana, Mexico",
    country: "MX",
    lat: 32.5149,
    lng: -117.0382,
    to: "WES",
    mode: "Ground",
    days: 7,
    singleSource: false,
    weekly: 10,
  },
  {
    material: "Imaging sensors",
    city: "Jena, Germany",
    country: "DE",
    lat: 50.9271,
    lng: 11.5892,
    to: "WIM",
    mode: "Ground",
    days: 2,
    singleSource: true,
    weekly: 3,
  },
  {
    material: "Microfluidic consumables",
    city: "Galway, Ireland",
    country: "IE",
    lat: 53.2707,
    lng: -9.0568,
    to: "WIM",
    mode: "Ground",
    days: 1,
    singleSource: false,
    weekly: 8,
  },
  {
    material: "Motors & actuators",
    city: "Shenzhen, China",
    country: "CN",
    lat: 22.5431,
    lng: 114.0579,
    to: "BIL-M",
    mode: "Ocean",
    days: 36,
    singleSource: false,
    weekly: 5,
  },
  {
    material: "Lithium cells (handheld meters)",
    city: "Suzhou, China",
    country: "CN",
    lat: 31.2989,
    lng: 120.5853,
    to: "BIL-L",
    mode: "Ocean",
    days: 35,
    singleSource: true,
    weekly: 3,
  },
];
const LONG_LEAD_DAYS = 30;

// ---------------------------------------------------------------------------
// Model (Crawford solution design §6): modes, SLA, sourcing
// ---------------------------------------------------------------------------

type Mode = "Ground" | "Express air" | "International air";
const MODE_COLOR: Record<Mode, string> = {
  Ground: "#38bdf8",
  "Express air": "#a78bfa",
  "International air": "#f472b6",
};
const CIRCUITY = 1.25;
/**
 * Illustrative kg CO2e per ~20 kg shipment per km, set so normal operations land
 * near the prototype's 4,402 kg/week (§7.1).
 */
const CO2E_PER_KM: Record<Mode, number> = {
  Ground: 0.0011,
  "Express air": 0.0136,
  "International air": 0.0114,
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

interface Option {
  site: Site;
  mode: Mode;
  km: number;
  days: number;
  costPerShipment: number;
}

type ConsideredOption = Option & { allowed: boolean };
function allModeOptions(site: Site, customer: Customer): ConsideredOption[] {
  const gc = haversineKm(site.lat, site.lng, customer.lat, customer.lng);
  const road = gc * CIRCUITY;
  const siteRegion = REGION_OF[site.country];
  const customerRegion = REGION_OF[customer.country];
  const sameRegion = siteRegion === customerRegion;
  return [
    {
      site,
      mode: "Ground",
      km: road,
      days: road <= 350 ? 1 : 1 + Math.floor((road - 350) / 800),
      costPerShipment: 18 + 0.035 * road + site.handling,
      allowed: (sameRegion && (siteRegion === "NA" || siteRegion === "EU")) || gc < 600,
    },
    {
      site,
      mode: "Express air",
      km: gc,
      days: gc < 5000 ? 1 : 2,
      costPerShipment: 45 + 0.06 * gc + site.handling,
      allowed: sameRegion && gc > 150,
    },
    {
      site,
      mode: "International air",
      km: gc,
      days: (gc < 6000 ? 2 : 3) + 1,
      costPerShipment: 120 + 0.07 * gc + site.handling,
      allowed: !sameRegion,
    },
  ];
}
function modeOptions(site: Site, customer: Customer): Option[] {
  return allModeOptions(site, customer).filter((o) => o.allowed);
}

function slaDays(customer: Customer): number {
  const region = REGION_OF[customer.country];
  const fast = region === "NA" || region === "EU";
  const critical = customer.segment === "Hospital" && customer.family === "CC";
  if (critical) return fast ? 2 : 3;
  return fast ? 3 : 5;
}

interface Scenario {
  key: string;
  label: string;
  offline: string[];
  /** Extra families a node stocks under the scenario (contingency profile). */
  contingency: Record<string, Family[]>;
}
const NORMAL: Scenario = {
  key: "normal",
  label: "Normal operations",
  offline: [],
  contingency: {},
};
const OUTAGE: Scenario = {
  key: "outage",
  label: "Billerica DC offline",
  offline: ["BIL-E"],
  contingency: {},
};
const RECOVERY: Scenario = {
  key: "contingency",
  label: "+ Norwood contingency",
  offline: ["BIL-E"],
  contingency: { NOR: ["CC", "BIO"] },
};

const WIMBORNE: Scenario = {
  key: "wimborne",
  label: "Wimborne hub offline",
  offline: ["WIM"],
  contingency: {},
};

interface Assignment {
  customer: Customer;
  best: Option;
  /** Every option the engine looked at, for the explain card. */
  options: Array<Option & { allowed: boolean; stocksIt: boolean }>;
  nearest: Site;
  withinSla: boolean;
  sla: number;
  reason: string;
}

function nodesFor(scenario: Scenario): Site[] {
  return SITES.filter((s) => !scenario.offline.includes(s.code)).filter(
    (s) => s.ships.length > 0 || (scenario.contingency[s.code]?.length ?? 0) > 0,
  );
}
function stocks(site: Site, family: Family, scenario: Scenario): boolean {
  return site.ships.includes(family) || (scenario.contingency[site.code] ?? []).includes(family);
}
function canServe(site: Site, customer: Customer): boolean {
  return site.serves === null || site.serves.includes(customer.country);
}

function assign(customer: Customer, scenario: Scenario): Assignment {
  const nodes = nodesFor(scenario);
  const sla = slaDays(customer);
  const candidates = nodes.filter(
    (s) => stocks(s, customer.family, scenario) && canServe(s, customer),
  );
  const options = candidates.flatMap((s) => modeOptions(s, customer));
  const considered = nodes
    .filter((s) => canServe(s, customer))
    .flatMap((s) =>
      allModeOptions(s, customer).map((o) => ({
        ...o,
        stocksIt: stocks(s, customer.family, scenario),
      })),
    )
    .filter((o) => o.stocksIt || o.allowed);
  const meeting = options.filter((o) => o.days <= sla);
  const pool = meeting.length > 0 ? meeting : options;
  const best = [...pool].sort((a, b) =>
    meeting.length > 0
      ? a.costPerShipment - b.costPerShipment
      : a.days - b.days || a.costPerShipment - b.costPerShipment,
  )[0];
  const nearest = [...nodes].sort(
    (a, b) =>
      haversineKm(a.lat, a.lng, customer.lat, customer.lng) -
      haversineKm(b.lat, b.lng, customer.lat, customer.lng),
  )[0];
  let reason = "Nearest node is also the optimal source";
  if (nearest.code !== best.site.code) {
    if (!stocks(nearest, customer.family, scenario)) {
      reason = `Nearest node (${nearest.code}) does not stock ${customer.family}`;
    } else if (!canServe(nearest, customer)) {
      reason = `Nearest node (${nearest.code}) only serves ${nearest.serves?.join(", ")}`;
    } else {
      reason = `${best.site.code} is cheaper within the ${sla}-day SLA`;
    }
  }
  return {
    customer,
    best,
    nearest,
    options: considered,
    withinSla: meeting.length > 0,
    sla,
    reason,
  };
}

interface Kpis {
  scenario: Scenario;
  assignments: Assignment[];
  withinSla: number;
  slaPct: number;
  avgTransit: number;
  freight: number;
  co2e: number;
  optimalNotNearest: number;
}
function runScenario(scenario: Scenario): Kpis {
  const assignments = CUSTOMERS.map((c) => assign(c, scenario));
  const withinSla = assignments.filter((a) => a.withinSla).length;
  const shipments = assignments.reduce((n, a) => n + a.customer.weekly, 0);
  return {
    scenario,
    assignments,
    withinSla,
    slaPct: (100 * withinSla) / assignments.length,
    avgTransit: assignments.reduce((n, a) => n + a.best.days * a.customer.weekly, 0) / shipments,
    freight: assignments.reduce((n, a) => n + a.best.costPerShipment * a.customer.weekly, 0),
    co2e: assignments.reduce(
      (n, a) => n + CO2E_PER_KM[a.best.mode] * a.best.km * a.customer.weekly,
      0,
    ),
    optimalNotNearest: assignments.filter((a) => a.nearest.code !== a.best.site.code).length,
  };
}

// ---------------------------------------------------------------------------
// Layer helpers
// ---------------------------------------------------------------------------

const fc = (features: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features });
const point = (lng: number, lat: number, properties: Record<string, unknown>): Feature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [round(lng), round(lat)] },
  properties,
});
const round = (value: number, digits = 5) => Number(value.toFixed(digits));
const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

function style(overrides: Partial<LayerStyle>): LayerStyle {
  return {
    ...DEFAULT_LAYER_STYLE,
    ...overrides,
    labels: { ...DEFAULT_LAYER_STYLE.labels, ...(overrides.labels ?? {}) },
  };
}

interface PopupField {
  field: string;
  label: string;
}
function geojsonLayer(params: {
  id: string;
  name: string;
  data: FeatureCollection;
  style: Partial<LayerStyle>;
  popupTitle?: string;
  popupFields?: PopupField[];
  visible?: boolean;
  opacity?: number;
}): GeoLibreLayer {
  return {
    id: params.id,
    name: params.name,
    type: "geojson",
    source: { type: "geojson" },
    visible: params.visible ?? true,
    opacity: params.opacity ?? 1,
    style: style(params.style),
    metadata: {},
    geojson: params.data,
    ...(params.popupFields
      ? {
          popup: {
            click: true,
            hover: false,
            showFeatureId: false,
            titleField: params.popupTitle,
            fields: params.popupFields,
          },
        }
      : {}),
  } as GeoLibreLayer;
}

const categorized = (property: string, classes: Array<[string, string]>): Partial<LayerStyle> => ({
  vectorStyleMode: "categorized",
  vectorStyleProperty: property,
  vectorStyleStops: classes.map(([value, color]) => ({ value, color, label: value })),
});

interface OdRow {
  o_lng: number;
  o_lat: number;
  d_lng: number;
  d_lat: number;
}
function arcLayer(params: {
  id: string;
  name: string;
  rows: OdRow[];
  color: string;
  width: number;
  opacity?: number;
  kind?: "arc" | "great-circle";
}): GeoLibreLayer {
  const layer = createDeckVizStoreLayer({
    id: params.id,
    name: params.name,
    rows: params.rows,
    config: {
      layerKind: params.kind ?? "arc",
      format: "csv-rows",
      fieldMapping: {
        sourceLng: "o_lng",
        sourceLat: "o_lat",
        targetLng: "d_lng",
        targetLat: "d_lat",
      },
      style: {
        color: params.color,
        radius: 40,
        cellSize: 1000,
        lineWidth: params.width,
        extruded: false,
        elevationScale: 30,
      },
    },
  });
  return { ...layer, opacity: params.opacity ?? 1 };
}
const od = (from: { lat: number; lng: number }, to: { lat: number; lng: number }): OdRow => ({
  o_lng: round(from.lng),
  o_lat: round(from.lat),
  d_lng: round(to.lng),
  d_lat: round(to.lat),
});

interface Trip {
  path: number[][];
  timestamps: number[];
}
function tripsLayer(
  id: string,
  name: string,
  trips: Trip[],
  color: string,
  width: number,
): GeoLibreLayer {
  return createDeckVizStoreLayer({
    id,
    name,
    rows: trips,
    config: {
      layerKind: "trips",
      format: "json-objects",
      fieldMapping: { path: "path", timestamps: "timestamps" },
      style: {
        color,
        radius: 40,
        cellSize: 1000,
        lineWidth: width,
        extruded: false,
        elevationScale: 30,
      },
    },
  });
}
/** Timestamps proportional to distance along `path`, spanning `duration` units (60/s). */
function trip(path: number[][], duration: number, start = 0): Trip {
  const seg = path.slice(1).map((p, i) => haversineKm(path[i][1], path[i][0], p[1], p[0]));
  const total = seg.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const timestamps = [start];
  for (const d of seg) {
    acc += d;
    timestamps.push(Math.round(start + (acc / total) * duration));
  }
  return { path: path.map(([lng, lat]) => [round(lng), round(lat)]), timestamps };
}

/** Regular polygon (a 3D column footprint) of `radiusKm` around a point. */
function column(lng: number, lat: number, radiusKm: number, sides = 16): number[][][] {
  const ring: number[][] = [];
  for (let i = 0; i <= sides; i += 1) {
    const angle = (2 * Math.PI * i) / sides;
    const dLat = (radiusKm / 111.32) * Math.sin(angle);
    const dLng = ((radiusKm / 111.32) * Math.cos(angle)) / Math.cos((lat * Math.PI) / 180);
    ring.push([round(lng + dLng), round(lat + dLat)]);
  }
  return [ring];
}

function siteProps(site: Site, status = "Operating"): Record<string, unknown> {
  return {
    code: site.code,
    name: site.name,
    type: site.type,
    role: site.role,
    status,
    erp_users: site.erp,
    crm_users: site.crm,
    total_users: site.erp + site.crm,
    ships: site.ships.map((f) => FAMILY_NAME[f]).join(", ") || "—",
  };
}

const SITE_POPUP: PopupField[] = [
  { field: "type", label: "Type" },
  { field: "role", label: "Role in network" },
  { field: "status", label: "Status" },
  { field: "erp_users", label: "ERP users" },
  { field: "crm_users", label: "CRM users" },
  { field: "ships", label: "Ships" },
];

/** 3D site columns: height = ERP + CRM users (with a floor so every site shows). */
function siteColumns(params: {
  id: string;
  name: string;
  sites: Site[];
  radiusKm: (s: Site) => number;
  metresPerUser: number;
  statusOf?: (s: Site) => string;
  colorOf?: (s: Site) => string;
  visible?: boolean;
  opacity?: number;
}): GeoLibreLayer {
  const features: Feature[] = params.sites.map((site) => ({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: column(site.lng, site.lat, params.radiusKm(site)) },
    properties: {
      ...siteProps(site, params.statusOf?.(site)),
      height_m: Math.max(site.erp + site.crm, 12) * params.metresPerUser,
      color: params.colorOf?.(site) ?? SITE_TYPE_COLOR[site.type],
    },
  }));
  return geojsonLayer({
    id: params.id,
    name: params.name,
    data: fc(features),
    visible: params.visible,
    opacity: params.opacity,
    style: {
      fillColor: "#0ea5e9",
      fillOpacity: 0.9,
      strokeColor: "#0f172a",
      strokeWidth: 0,
      extrusionEnabled: true,
      extrusionHeightProperty: "height_m",
      extrusionOpacity: 0.92,
      extrusionAdvancedStyleEnabled: true,
      extrusionColorExpression: JSON.stringify(["get", "color"]),
      extrusionHeightExpression: JSON.stringify(["get", "height_m"]),
    },
    popupTitle: "name",
    popupFields: SITE_POPUP,
  });
}

function siteMarkers(id: string, sites: Site[], labelMinZoom = 3.5): GeoLibreLayer {
  return geojsonLayer({
    id,
    name: "Nova sites",
    data: fc(sites.map((s) => point(s.lng, s.lat, siteProps(s)))),
    style: {
      ...categorized("type", [
        ["Manufacturing", SITE_TYPE_COLOR.Manufacturing],
        ["Distribution center", SITE_TYPE_COLOR["Distribution center"]],
        ["Forward stocking", SITE_TYPE_COLOR["Forward stocking"]],
        ["Office", SITE_TYPE_COLOR.Office],
      ]),
      circleRadius: 6,
      strokeColor: "#0f172a",
      strokeWidth: 1.5,
      fillOpacity: 1,
      labels: {
        ...DEFAULT_LAYER_STYLE.labels,
        enabled: true,
        field: "code",
        size: 12,
        color: "#e2e8f0",
        haloColor: "#0f172a",
        haloWidth: 1.5,
        anchor: "top",
        offsetY: 1,
        minZoom: labelMinZoom,
      },
    },
    popupTitle: "name",
    popupFields: SITE_POPUP,
  });
}

function customerFeatures(assignments: Assignment[]): Feature[] {
  return assignments.map((a) =>
    point(a.customer.lng, a.customer.lat, {
      id: a.customer.id,
      name: a.customer.name,
      segment: a.customer.segment,
      family: FAMILY_NAME[a.customer.family],
      weekly_shipments: a.customer.weekly,
      served_from: a.best.site.code,
      mode: a.best.mode,
      transit_days: a.best.days,
      sla_days: a.sla,
      sla_status: a.withinSla ? "Within SLA" : "SLA at risk",
      within_sla_pct: a.withinSla ? 100 : 0,
      nearest_node: a.nearest.code,
      optimal_not_nearest: a.nearest.code !== a.best.site.code ? 1 : 0,
      why: a.reason,
      weekly_freight_usd: Math.round(a.best.costPerShipment * a.customer.weekly),
      weekly_co2e_kg: Math.round(CO2E_PER_KM[a.best.mode] * a.best.km * a.customer.weekly),
      cost_per_shipment_usd: Math.round(a.best.costPerShipment * 100) / 100,
      nearest_km: Math.round(
        haversineKm(a.nearest.lat, a.nearest.lng, a.customer.lat, a.customer.lng) * CIRCUITY,
      ),
      alternatives: JSON.stringify(
        [...a.options]
          .sort(
            (x, y) =>
              Number(!x.allowed || !x.stocksIt) - Number(!y.allowed || !y.stocksIt) ||
              x.costPerShipment - y.costPerShipment,
          )
          .slice(0, 8)
          .map((o) => ({
            node: o.site.code,
            mode: o.mode,
            km: Math.round(o.km),
            days: o.days,
            cost: Math.round(o.costPerShipment),
            status:
              o.site.code === a.best.site.code && o.mode === a.best.mode
                ? "chosen"
                : !o.stocksIt
                  ? "no stock"
                  : !o.allowed
                    ? "not allowed"
                    : o.days > a.sla
                      ? "misses SLA"
                      : "costlier",
          })),
      ),
    }),
  );
}
const CUSTOMER_POPUP: PopupField[] = [
  { field: "segment", label: "Segment" },
  { field: "family", label: "Product family" },
  { field: "weekly_shipments", label: "Weekly shipments" },
  { field: "served_from", label: "Optimal source" },
  { field: "mode", label: "Mode" },
  { field: "transit_days", label: "Transit (days)" },
  { field: "sla_days", label: "SLA (days)" },
  { field: "sla_status", label: "Status" },
  { field: "nearest_node", label: "Nearest node" },
  { field: "why", label: "Why this source" },
  { field: "weekly_freight_usd", label: "Weekly freight (USD)" },
];

function customerLayer(
  id: string,
  name: string,
  assignments: Assignment[],
  opts: { visible?: boolean; opacity?: number } = {},
): GeoLibreLayer {
  return geojsonLayer({
    id,
    name,
    data: fc(customerFeatures(assignments)),
    visible: opts.visible,
    opacity: opts.opacity,
    style: {
      ...categorized(
        "family",
        (Object.keys(FAMILY_NAME) as Family[]).map((f) => [FAMILY_NAME[f], FAMILY_COLOR[f]]),
      ),
      fillOpacity: 0.95,
      strokeColor: "#0f172a",
      strokeWidth: 1,
      proportionalSizeEnabled: true,
      proportionalSizeProperty: "weekly_shipments",
      proportionalSizeMinValue: Math.min(...CUSTOMERS.map((c) => c.weekly)),
      proportionalSizeMaxValue: Math.max(...CUSTOMERS.map((c) => c.weekly)),
      proportionalSizeMinRadius: 4,
      proportionalSizeMaxRadius: 11,
    },
    popupTitle: "name",
    popupFields: CUSTOMER_POPUP,
  });
}

function slaRiskLayer(
  id: string,
  name: string,
  assignments: Assignment[],
  opts: { visible?: boolean; opacity?: number } = {},
): GeoLibreLayer {
  return geojsonLayer({
    id,
    name,
    data: fc(customerFeatures(assignments.filter((a) => !a.withinSla))),
    visible: opts.visible,
    opacity: opts.opacity,
    style: {
      fillColor: "#ef4444",
      fillOpacity: 0.25,
      strokeColor: "#ef4444",
      strokeWidth: 3,
      circleRadius: 14,
      labels: {
        ...DEFAULT_LAYER_STYLE.labels,
        enabled: true,
        field: "name",
        size: 12,
        color: "#fecaca",
        haloColor: "#0f172a",
        haloWidth: 1.5,
        anchor: "left",
        offsetX: 1.4,
      },
    },
    popupTitle: "name",
    popupFields: CUSTOMER_POPUP,
  });
}

function outboundArcs(
  prefix: string,
  label: string,
  assignments: Assignment[],
  opacity = 1,
): GeoLibreLayer[] {
  const modes: Mode[] = ["Ground", "Express air", "International air"];
  return modes
    .map((mode) => {
      const rows = assignments
        .filter((a) => a.best.mode === mode)
        .map((a) => od(a.best.site, a.customer));
      if (rows.length === 0) return null;
      return arcLayer({
        id: `${prefix}-${mode.toLowerCase().replace(/ /g, "-")}`,
        name: `${label}: ${mode} (${rows.length})`,
        rows,
        color: MODE_COLOR[mode],
        width: mode === "Ground" ? 2 : 2.5,
        opacity,
      });
    })
    .filter((layer): layer is GeoLibreLayer => layer !== null);
}

// ---------------------------------------------------------------------------
// Project scaffolding
// ---------------------------------------------------------------------------

function project(params: {
  name: string;
  description: string;
  view: { center: [number, number]; zoom: number; pitch: number; bearing: number };
  layers: GeoLibreLayer[];
  legendTitle: string;
  storymap?: GeoLibreProject["storymap"];
  widgets?: DashboardWidget[];
  dashboardColumns?: number;
  controlTower?: ControlTowerConfig;
}): GeoLibreProject {
  const base = createEmptyProject(params.name, {
    mapView: params.view,
    basemapStyleUrl: DARK_BASEMAP,
  });
  return {
    ...base,
    // Flat map, like the solution design's prototype: deck.gl arcs are drawn
    // for Mercator and do not follow the globe's curvature.
    preferences: { ...base.preferences, map: { ...base.preferences!.map, projection: "mercator" } },
    // The layer list is bottom-to-top in the store; callers list top-first.
    layers: [...params.layers].reverse(),
    legend: {
      ...base.legend!,
      title: params.legendTitle,
      groupByLayer: true,
      // The Control Tower shell draws its own compact legend from the config.
      panelVisible: !params.controlTower,
      panelPosition: "bottom-right",
    },
    metadata: {
      description: params.description,
      sampleData: true,
      generatedBy: "scripts/gen-nova-demos.ts",
      ...(params.controlTower ? { controlTower: params.controlTower } : {}),
    },
    // With a Control Tower config the shell owns the tour and KPIs, so the
    // story-map scroller and dashboard are left out of the file.
    ...(params.storymap && !params.controlTower ? { storymap: params.storymap } : {}),
    ...(params.widgets && !params.controlTower
      ? { widgets: params.widgets, dashboardColumns: params.dashboardColumns ?? 3 }
      : {}),
  };
}

function chapter(
  id: string,
  title: string,
  description: string,
  location: StoryChapter["location"],
  enter: Array<[string, number]> = [],
  alignment: StoryChapter["alignment"] = "left",
): StoryChapter {
  return {
    id,
    title,
    description,
    alignment,
    hidden: false,
    location,
    mapAnimation: "flyTo",
    rotateAnimation: false,
    onChapterEnter: enter.map(([layerId, opacity], i) => ({
      id: `${id}-in-${i}`,
      layerId,
      opacity,
      duration: 900,
    })),
    onChapterExit: [],
  };
}

function story(
  title: string,
  subtitle: string,
  chapters: StoryChapter[],
): GeoLibreProject["storymap"] {
  return {
    title,
    subtitle,
    byline: "Geoverse · Powered by Aether AI",
    footer:
      "Illustrative sample data. Site locations approximate; customers, suppliers, volumes and rates are invented.",
    theme: "dark",
    showMarkers: false,
    markerColor: "#38bdf8",
    inset: false,
    insetPosition: "bottom-left",
    hideChapterNav: false,
    startSlide: "none",
    endSlide: "none",
    chapters,
  };
}

const indicator = (
  id: string,
  layerId: string,
  title: string,
  field: string,
  agg: DashboardWidget["indicatorAggregation"],
  prefix = "",
  suffix = "",
  color?: string,
): DashboardWidget => ({
  id,
  layerId,
  type: "indicator",
  title,
  field,
  indicatorAggregation: agg,
  ...(prefix ? { prefix } : {}),
  ...(suffix ? { suffix } : {}),
  ...(color ? { color } : {}),
});

const VIEWS = {
  world: { center: [15, 28] as [number, number], zoom: 1.6, pitch: 25, bearing: 0 },
  northAmerica: { center: [-90, 38] as [number, number], zoom: 3.3, pitch: 45, bearing: -10 },
  newEngland: { center: [-71.35, 42.45] as [number, number], zoom: 7.6, pitch: 58, bearing: -18 },
  europe: { center: [4, 49] as [number, number], zoom: 4.2, pitch: 45, bearing: 0 },
  apac: { center: [128, 10] as [number, number], zoom: 2.6, pitch: 35, bearing: 0 },
};

const SAMPLE_NOTE =
  "<p style='opacity:.7;font-size:12px'>Sample data: Nova sites from the ERP/CRM footprint (locations approximate); customers, suppliers, volumes and rates are illustrative.</p>";

const normal = runScenario(NORMAL);
const outage = runScenario(OUTAGE);
const recovery = runScenario(RECOVERY);
const columnRadius = (s: Site) => (["WAL", "BIL-E", "BIL-M", "BIL-L"].includes(s.code) ? 1.4 : 9);

// ---------------------------------------------------------------------------
// Control Tower config (shared by every demo)
// ---------------------------------------------------------------------------

const wimborne = runScenario(WIMBORNE);
const SCENARIO_RUNS: Array<[Scenario, Kpis, CtScenario["tone"]]> = [
  [NORMAL, normal, "normal"],
  [OUTAGE, outage, "danger"],
  [RECOVERY, recovery, "good"],
  [WIMBORNE, wimborne, "danger"],
];
const CT_LENSES: CtLens[] = [
  {
    id: "network",
    label: "Network",
    url: "demos/nova/1-nova-global-network.geoverse.json",
    icon: "network",
  },
  {
    id: "sourcing",
    label: "Sourcing",
    url: "demos/nova/2-nova-optimal-sourcing.geoverse.json",
    icon: "sourcing",
  },
  {
    id: "routes",
    label: "Routes",
    url: "demos/nova/3-nova-new-england-routes.geoverse.json",
    icon: "routes",
  },
  {
    id: "inbound",
    label: "Inbound",
    url: "demos/nova/4-nova-supplier-risk.geoverse.json",
    icon: "inbound",
    badge: 7,
  },
  {
    id: "scenarios",
    label: "Scenarios",
    url: "demos/nova/5-nova-billerica-outage.geoverse.json",
    icon: "scenarios",
  },
  {
    id: "installed",
    label: "Installed base",
    url: "demos/nova/6-nova-installed-base.geoverse.json",
    icon: "installed",
  },
];
const CT_VIEWS = [
  { label: "World", camera: VIEWS.world },
  { label: "North America", camera: VIEWS.northAmerica },
  { label: "New England", camera: VIEWS.newEngland },
  { label: "Europe", camera: VIEWS.europe },
  { label: "Asia-Pacific", camera: VIEWS.apac },
];
const DATA_NOTICE =
  "Sample data. Nova sites from the ERP/CRM footprint (locations approximate); customers, suppliers, volumes and rates are illustrative.";

function flaggedLaneCount(scenario: Scenario): number {
  return SUPPLIERS.filter(
    (s) => s.singleSource || s.days > LONG_LEAD_DAYS || scenario.offline.includes(s.to),
  ).length;
}
function kpisFor(k: Kpis): CtKpi[] {
  return [
    {
      id: "sla",
      label: "Customers within SLA",
      value: k.slaPct,
      format: "pct",
      detail: `${k.withinSla}/47`,
    },
    {
      id: "transit",
      label: "Avg outbound transit",
      value: k.avgTransit,
      format: "days",
      higherIsWorse: true,
    },
    {
      id: "freight",
      label: "Weekly outbound freight",
      value: k.freight,
      format: "usd",
      higherIsWorse: true,
    },
    { id: "co2e", label: "Weekly CO₂e", value: k.co2e, format: "kg", higherIsWorse: true },
    {
      id: "nn",
      label: "Optimal ≠ nearest",
      value: k.optimalNotNearest,
      format: "int",
      detail: "customers",
    },
    {
      id: "inbound",
      label: "Inbound lanes flagged",
      value: flaggedLaneCount(k.scenario),
      format: "int",
      detail: "of 14",
      higherIsWorse: true,
    },
  ];
}
function exceptionsFor(k: Kpis): CtException[] {
  const out: CtException[] = [];
  for (const code of k.scenario.offline) {
    const site = siteByCode(code);
    out.push({
      id: `site-${code}`,
      severity: "red",
      badge: "SITE",
      title: `${site.name} offline`,
      detail: `Declared down · sourcing re-planned without ${code}`,
      value: code,
      valueLabel: "node",
      location: [site.lng, site.lat],
      zoom: 8,
    });
  }
  for (const a of [...k.assignments]
    .filter((x) => !x.withinSla)
    .sort((x, y) => y.customer.weekly - x.customer.weekly)) {
    out.push({
      id: `sla-${a.customer.id}`,
      severity: "red",
      badge: "SLA",
      title: a.customer.name,
      detail: `${a.best.days} d transit vs ${a.sla} d SLA · ${a.best.site.code} by ${a.best.mode.toLowerCase()}`,
      value: `${a.customer.weekly}/wk`,
      valueLabel: "shipments",
      location: [a.customer.lng, a.customer.lat],
      zoom: 6,
    });
  }
  for (const s of [...SUPPLIERS].sort((x, y) => y.days - x.days)) {
    const outage = k.scenario.offline.includes(s.to);
    const both = s.singleSource && s.days > LONG_LEAD_DAYS;
    if (!(s.singleSource || s.days > LONG_LEAD_DAYS || outage)) continue;
    const flags = [
      s.singleSource ? "single source" : "",
      s.days > LONG_LEAD_DAYS ? "long lead" : "",
      outage ? "receiving site offline" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    out.push({
      id: `in-${s.city}`,
      severity: both || outage ? "red" : "amber",
      badge: "IN",
      title: s.material,
      detail: `${s.city} → ${s.to} · ${s.days} d ${s.mode.toLowerCase()} · ${flags}`,
      value: `${s.days} d`,
      valueLabel: "lead time",
      location: [s.lng, s.lat],
      zoom: 4,
    });
  }
  return out;
}
const scenarioAlert = (sc: Scenario, k: Kpis) => {
  if (sc.key === "outage" || sc.key === "contingency")
    return {
      title: "Billerica – Enterprise Rd declared down",
      body: `Continuity Command Center · re-plan ran in 0.8 s. Critical Care and Bioprocess demand ${sc.key === "outage" ? "falls back to the Wimborne EU hub by international air" : "is served from Norwood under the contingency profile"}. ${k.assignments.filter((a) => !a.withinSla).length} customers outside SLA.`,
    };
  if (sc.key === "wimborne")
    return {
      title: "Wimborne / Ferndown hub declared down",
      body: `European Critical Care demand moves to the German FSL; Osmolality, QC and Bioprocess customers fall back to the US by international air. ${k.assignments.filter((a) => !a.withinSla).length} customers outside SLA.`,
    };
  return undefined;
};
const scenarioRecommendation = (sc: Scenario) => {
  if (sc.key === "outage")
    return {
      title: "Activate Norwood as contingency DC",
      body: `Pre-positioned Critical Care + Bioprocess stock at Norwood restores <b>${recovery.slaPct.toFixed(1)}% within SLA</b> at <b>${money(recovery.freight)}/week</b> (+${Math.round(((recovery.freight - normal.freight) / normal.freight) * 100)}% vs normal). The profile is maintained once and shared with the Continuity platform.`,
      scenarioId: "contingency",
      actionLabel: "Preview on map",
    };
  if (sc.key === "contingency")
    return {
      title: "Contingency profile active",
      body: `Norwood carries Critical Care and Bioprocess while Billerica is down. Service is back to <b>${recovery.slaPct.toFixed(1)}%</b>; the only remaining exception is the structural Korea gap. Activation requires continuity-manager approval and is audited.`,
      scenarioId: "normal",
      actionLabel: "Back to normal",
    };
  if (sc.key === "wimborne")
    return {
      title: "Pre-position Osmolality and Bioprocess stock in Germany",
      body: `The German FSL already covers Critical Care for six countries. Adding OSM and BIO stock there would keep European customers within SLA during a UK hub outage instead of air-freighting from Massachusetts.`,
    };
  return undefined;
};
const SCENARIO_CAMERA: Record<string, StoryChapter["location"] | undefined> = {
  outage: { center: [-41, 42], zoom: 2.6, pitch: 40, bearing: -4 },
  wimborne: { center: [-20, 46], zoom: 2.6, pitch: 40, bearing: 0 },
};

/**
 * Per-scenario layer sets (SLA rings, outbound arcs by mode, 3D site columns)
 * for one demo, plus the opacity map each scenario applies. Only the normal
 * set is visible in the file; the shell switches the others on.
 */
function scenarioLayerSets(
  prefix: string,
  opts: {
    columns?: boolean;
    arcs?: boolean;
    risk?: boolean;
    columnRadius?: (s: Site) => number;
    metresPerUser?: number;
  } = {},
) {
  const { columns = true, arcs = true, risk = true } = opts;
  const layers: GeoLibreLayer[] = [];
  const ids: Record<string, string[]> = {};
  const statusOf = (sc: Scenario) => (s: Site) =>
    sc.offline.includes(s.code)
      ? "OFFLINE"
      : sc.contingency[s.code]
        ? "Contingency DC (CC + BIO stock)"
        : "Operating";
  const colorOf = (sc: Scenario) => (s: Site) =>
    sc.offline.includes(s.code)
      ? "#ef4444"
      : sc.contingency[s.code]
        ? "#22c55e"
        : SITE_TYPE_COLOR[s.type];
  for (const [sc, k] of SCENARIO_RUNS) {
    const vis = sc.key === "normal";
    const set: GeoLibreLayer[] = [];
    if (risk)
      set.push(
        slaRiskLayer(`${prefix}-risk-${sc.key}`, `SLA at risk – ${sc.label}`, k.assignments, {
          opacity: vis ? 1 : 0,
        }),
      );
    if (arcs)
      set.push(...outboundArcs(`${prefix}-${sc.key}`, sc.label, k.assignments, vis ? 1 : 0));
    if (columns)
      set.push(
        siteColumns({
          id: `${prefix}-columns-${sc.key}`,
          name: `Sites – ${sc.label}`,
          sites: SITES,
          radiusKm: opts.columnRadius ?? columnRadius,
          metresPerUser: opts.metresPerUser ?? 900,
          statusOf: statusOf(sc),
          colorOf: colorOf(sc),
          opacity: vis ? 1 : 0,
        }),
      );
    ids[sc.key] = set.map((l) => l.id);
    layers.push(...set);
  }
  const all = Object.values(ids).flat();
  const opacityFor = (key: string): Record<string, number> =>
    Object.fromEntries(all.map((id) => [id, ids[key].includes(id) ? 1 : 0]));
  return { layers, opacityFor, ids };
}

function ctScenarios(
  opacityFor: (key: string) => Record<string, number>,
  withCamera = true,
): CtScenario[] {
  return SCENARIO_RUNS.map(([sc, k, tone]) => ({
    id: sc.key,
    label: sc.label,
    tone,
    layers: opacityFor(sc.key),
    kpis: kpisFor(k),
    exceptions: exceptionsFor(k),
    alert: scenarioAlert(sc, k),
    recommendation: scenarioRecommendation(sc),
    ...(withCamera && SCENARIO_CAMERA[sc.key] ? { camera: SCENARIO_CAMERA[sc.key] } : {}),
  }));
}
/** A single-scenario lens (routes, inbound, installed base): KPIs only. */
function ctNormalOnly(kpis: CtKpi[], exceptions: CtException[] = []): CtScenario[] {
  return [{ id: "normal", label: NORMAL.label, tone: "normal", layers: {}, kpis, exceptions }];
}
function tourFromChapters(chapters: StoryChapter[]): CtTourStep[] {
  return chapters.map((c) => ({
    id: c.id,
    title: c.title,
    body: c.description,
    camera: c.location,
    ...(c.onChapterEnter.length
      ? { layers: Object.fromEntries(c.onChapterEnter.map((e) => [e.layerId, e.opacity])) }
      : {}),
  }));
}
function ctConfig(params: {
  lensId: string;
  title: string;
  scenarios: CtScenario[];
  sections: CtSection[];
  panelTitle: string;
  panelSubtitle?: string;
  explainLayers: string[];
  chapters: StoryChapter[];
  ask: CtAskItem[];
  askPlaceholder?: string;
  legendTitle: string;
  legend: ControlTowerConfig["legend"];
  views?: typeof CT_VIEWS;
}): ControlTowerConfig {
  return {
    version: 1,
    client: "Nova Biomedical",
    title: params.title,
    lensId: params.lensId,
    lenses: CT_LENSES,
    scenarios: params.scenarios,
    defaultScenarioId: "normal",
    views: params.views ?? CT_VIEWS,
    sections: params.sections,
    panelTitle: params.panelTitle,
    panelSubtitle: params.panelSubtitle,
    explainLayers: params.explainLayers,
    tour: {
      steps: tourFromChapters(params.chapters),
      durationLabel: `${params.chapters.length} stops`,
    },
    ask: { placeholder: params.askPlaceholder ?? "Ask about the network…", items: params.ask },
    legendTitle: params.legendTitle,
    legend: params.legend,
    dataNotice: DATA_NOTICE,
  };
}
const LEGEND_NETWORK: ControlTowerConfig["legend"] = {
  title: "Network · sample data",
  items: [
    {
      label: "Distribution center (column = ERP + CRM users)",
      color: SITE_TYPE_COLOR["Distribution center"],
    },
    { label: "Manufacturing", color: SITE_TYPE_COLOR.Manufacturing },
    { label: "Forward stocking", color: SITE_TYPE_COLOR["Forward stocking"] },
    { label: "Critical Care customer", color: FAMILY_COLOR.CC },
    { label: "Bioprocess customer", color: FAMILY_COLOR.BIO },
    { label: "Osmolality customer", color: FAMILY_COLOR.OSM },
    { label: "Liquid-handling QC customer", color: FAMILY_COLOR.LHQ },
    { label: "Ground lane", color: MODE_COLOR.Ground, kind: "line" },
    { label: "Express air lane", color: MODE_COLOR["Express air"], kind: "line" },
    { label: "International air lane", color: MODE_COLOR["International air"], kind: "line" },
    { label: "SLA at risk", color: "#ef4444", kind: "ring" },
  ],
};
const LEGEND_MODES: ControlTowerConfig["legend"] = {
  title: "Outbound lanes by mode",
  items: [
    { label: "Ground", color: MODE_COLOR.Ground, kind: "line" },
    { label: "Express air", color: MODE_COLOR["Express air"], kind: "line" },
    { label: "International air", color: MODE_COLOR["International air"], kind: "line" },
    { label: "Nearest node, where it is not optimal", color: "#94a3b8", kind: "line" },
    { label: "SLA at risk", color: "#ef4444", kind: "ring" },
    { label: "Site offline", color: "#ef4444" },
    { label: "Contingency DC", color: "#22c55e" },
  ],
};
const misses = (k: Kpis) => k.assignments.filter((a) => !a.withinSla);
const topMisses = (k: Kpis, n: number) =>
  [...misses(k)].sort((a, b) => b.customer.weekly - a.customer.weekly).slice(0, n);
const pctUp = (v: number, b: number) => `${Math.round(((v - b) / b) * 100)}%`;
/** Questions that work in every lens; answers come from the same model as the map. */
function commonAsk(riskOutageLayer?: string): CtAskItem[] {
  return [
    {
      question: "Which customers miss SLA if Billerica is down?",
      answer: `<p><b>${misses(outage).length} customers</b> fall outside SLA if Billerica – Enterprise Rd goes offline, <b>${misses(outage).filter((a) => a.customer.segment === "Hospital").length} of them hospitals</b> on a 2-day Critical Care SLA. Demand falls back to Wimborne by international air (3 days including customs).</p><p>Biggest by volume: ${topMisses(
        outage,
        4,
      )
        .map((a) => `<b>${a.customer.name.split(",")[0]}</b> (${a.customer.weekly}/wk)`)
        .join(
          ", ",
        )}.</p><p>Weekly freight rises from <b>${money(normal.freight)}</b> to <b>${money(outage.freight)}</b> (+${pctUp(outage.freight, normal.freight)}). Activating Norwood as a contingency DC brings it back to <b>${recovery.slaPct.toFixed(1)}%</b> within SLA at <b>${money(recovery.freight)}</b>.</p>`,
      citations: [
        "scenario: billerica-offline",
        "47 ship-tos · S/4HANA KNA1 (sample)",
        "rates: placeholder, Process Weaver pending",
      ],
      scenarioId: "outage",
      ...(riskOutageLayer ? { highlightLayers: [riskOutageLayer] } : {}),
    },
    {
      question: "Why isn't Boston served from Norwood?",
      answer: `<p>Norwood is Boston's nearest node (34 km) but its stocking profile carries <b>Osmolality only</b>. Boston buys Critical Care, which is stocked at Billerica – Enterprise Rd (normal operations) and, under the contingency profile, at Norwood too.</p>`,
      citations: ["stocking profile NOR · S/4HANA MARC (sample)"],
      camera: VIEWS.newEngland,
    },
    {
      question: "Cheapest way to serve Seoul within 3 days?",
      answer: `<p>There is none today. The Japan FSL serves Japan only, so Seoul ships from Wimborne by international air in <b>4 days</b> against a <b>3-day</b> SLA. A Korea stocking point, or letting Taipei manufacturing hold finished Critical Care stock, would close the gap at roughly a third of the current lane cost.</p>`,
      citations: ["countries-served rule: JPN → JP only (assumption, §3.1)"],
      camera: VIEWS.apac,
    },
    {
      question: "Show me every single-source lane via Suez",
      answer: `<p>Three single-source lanes share the Suez route: <b>sensor chips</b> (Hsinchu → Waltham, 36 d), <b>lithium cells</b> (Suzhou → Billerica Lexington Rd, 35 d) and <b>PCB assemblies</b> (Penang → Billerica Manning Rd, 39 d). Motors from Shenzhen use it too but have a second source. A 7-day canal closure delays all four at once.</p>`,
      citations: ["14 inbound lanes · vendor master (sample)"],
      camera: { center: [55, 24], zoom: 1.8, pitch: 26, bearing: 0 },
    },
  ];
}

// ---------------------------------------------------------------------------
// Demo 1: Global network
// ---------------------------------------------------------------------------

function supplierFeatures(): Feature[] {
  return SUPPLIERS.map((s) => {
    const longLead = s.days > LONG_LEAD_DAYS;
    const flags = [s.singleSource ? "Single source" : "", longLead ? "Long lead time" : ""].filter(
      Boolean,
    );
    return point(s.lng, s.lat, {
      name: `${s.material} · ${s.city}`,
      material: s.material,
      location: s.city,
      receiving_site: s.to,
      mode: s.mode,
      lead_time_days: s.days,
      weekly_volume: s.weekly,
      single_source: s.singleSource ? "Yes" : "No",
      risk: flags.length === 2 ? "Single source + long lead" : (flags[0] ?? "Low risk"),
      flags: flags.join(", ") || "None",
    });
  });
}
const SUPPLIER_POPUP: PopupField[] = [
  { field: "material", label: "Material" },
  { field: "location", label: "Ships from" },
  { field: "receiving_site", label: "Receiving site" },
  { field: "mode", label: "Mode" },
  { field: "lead_time_days", label: "Lead time (days)" },
  { field: "single_source", label: "Single source" },
  { field: "flags", label: "Risk flags" },
];
const RISK_CLASSES: Array<[string, string]> = [
  ["Single source + long lead", "#ef4444"],
  ["Long lead time", "#f97316"],
  ["Single source", "#facc15"],
  ["Low risk", "#a3a3a3"],
];
function supplierLayer(id: string): GeoLibreLayer {
  return geojsonLayer({
    id,
    name: "Suppliers (sample)",
    data: fc(supplierFeatures()),
    style: {
      ...categorized("risk", RISK_CLASSES),
      circleRadius: 7,
      fillOpacity: 1,
      strokeColor: "#fef3c7",
      strokeWidth: 1.5,
    },
    popupTitle: "name",
    popupFields: SUPPLIER_POPUP,
  });
}

function demoGlobalNetwork(): GeoLibreProject {
  const sets = scenarioLayerSets("d1");
  const layers = [
    siteMarkers("d1-site-markers", SITES),
    supplierLayer("d1-suppliers"),
    customerLayer("d1-customers", "Customers (sample) – by product family", normal.assignments),
    ...sets.layers,
  ];
  const chapters = [
    chapter(
      "world",
      "One map of the whole Nova network",
      `<p>15 Nova sites, 47 customers and 14 suppliers on one 3D map. Column height shows ERP + CRM users at each site, a proxy for site activity.</p><p>Customers are coloured by product family and sized by weekly shipments. Suppliers are coloured by risk.</p>${SAMPLE_NOTE}`,
      VIEWS.world,
    ),
    chapter(
      "na",
      "North America: where most of the business runs",
      "<p>81% of ERP users sit in North America. Customers span every major US metro and three Canadian hubs, served from the Massachusetts core and the Ontario forward stocking location.</p>",
      VIEWS.northAmerica,
    ),
    chapter(
      "ne",
      "The Massachusetts ERP core",
      "<p>Waltham HQ, three Billerica sites, Norwood and Westbrook, ME carry manufacturing, warehousing and finance. Billerica – Enterprise Rd is the main distribution centre for Critical Care and Bioprocess.</p>",
      VIEWS.newEngland,
    ),
    chapter(
      "eu",
      "Europe: the UK hub and the German FSL",
      "<p>Wimborne / Ferndown is the EU hub for all four product families. The German subsidiary forward-stocks Critical Care for six countries; France and Italy are sales and service offices.</p>",
      VIEWS.europe,
    ),
    chapter(
      "apac",
      "Asia-Pacific",
      "<p>Taipei manufactures Critical Care. Japan and Australia forward-stock it for their own markets. Korea has no local node, which is the structural gap shown in the next demos.</p>",
      VIEWS.apac,
    ),
  ];
  return project({
    name: "Nova Biomedical · Global Network (sample data)",
    description:
      "Nova sites as 3D columns, sample customers by product family and sample suppliers by risk.",
    view: VIEWS.northAmerica,
    layers,
    legendTitle: "Nova network · sample data",
    storymap: story(
      "Nova Biomedical Global Network",
      "Supply Chain Control Tower · Network visibility",
      chapters,
    ),
    controlTower: ctConfig({
      lensId: "network",
      title: "Network",
      scenarios: ctScenarios(sets.opacityFor),
      panelTitle: "Exceptions",
      panelSubtitle: "Ranked by severity · click one to fly there",
      sections: [
        {
          type: "kpis",
          items: [
            { label: "Sites online", value: "15 / 15", tone: "good" },
            { label: "Lanes active", value: String(CUSTOMERS.length + SUPPLIERS.length) },
            { label: "Data feeds", value: "S/4HANA · PW", detail: "sample extract" },
          ],
        },
        {
          type: "card",
          title: "How to read this map",
          body: "Column height is ERP + CRM users at each site, a proxy for activity. Customers are coloured by product family and sized by weekly shipments; arcs are the optimal lane by mode. Switch the scenario above to re-plan the whole network.",
        },
      ],
      explainLayers: ["d1-customers", "d1-suppliers", "d1-site-markers"],
      chapters,
      ask: commonAsk("d1-risk-outage"),
      legendTitle: "Nova network · sample data",
      legend: LEGEND_NETWORK,
    }),
  });
}

// ---------------------------------------------------------------------------
// Demo 2: Optimal source vs nearest
// ---------------------------------------------------------------------------

function nearestLines(assignments: Assignment[]): FeatureCollection {
  return fc(
    assignments
      .filter((a) => a.nearest.code !== a.best.site.code)
      .map((a) => ({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [round(a.nearest.lng), round(a.nearest.lat)],
            [round(a.customer.lng), round(a.customer.lat)],
          ],
        },
        properties: {
          name: a.customer.name,
          nearest_node: a.nearest.code,
          optimal_source: a.best.site.code,
          why: a.reason,
        },
      })),
  );
}

function demoSourcing(): GeoLibreProject {
  const sets = scenarioLayerSets("d2", { metresPerUser: 500 });
  const layers = [
    customerLayer("d2-customers", "Customers (sample) – by product family", normal.assignments),
    siteMarkers("d2-site-markers", SITES),
    ...sets.layers,
    geojsonLayer({
      id: "d2-nearest",
      name: `Nearest node, where it is NOT optimal (${normal.optimalNotNearest})`,
      data: nearestLines(normal.assignments),
      // Visible but transparent: story chapters can change opacity, not visibility.
      opacity: 0,
      style: { strokeColor: "#94a3b8", strokeWidth: 1.5, fillOpacity: 0.6 },
      popupTitle: "name",
      popupFields: [
        { field: "nearest_node", label: "Nearest node" },
        { field: "optimal_source", label: "Optimal source" },
        { field: "why", label: "Why" },
      ],
    }),
  ];
  const k = normal;
  const widgets: DashboardWidget[] = [
    indicator(
      "w-sla",
      "d2-customers",
      "Customers within SLA",
      "within_sla_pct",
      "mean",
      "",
      "%",
      "#22c55e",
    ),
    indicator(
      "w-transit",
      "d2-customers",
      "Avg transit per customer (days)",
      "transit_days",
      "mean",
      "",
      " d",
    ),
    indicator(
      "w-freight",
      "d2-customers",
      "Weekly outbound freight",
      "weekly_freight_usd",
      "sum",
      "$",
      "",
    ),
    indicator("w-co2", "d2-customers", "Weekly outbound CO₂e", "weekly_co2e_kg", "sum", "", " kg"),
    indicator("w-nn", "d2-customers", "Optimal ≠ nearest node", "optimal_not_nearest", "sum"),
    {
      id: "w-mode",
      layerId: "d2-customers",
      type: "bar",
      title: "Weekly shipments by mode",
      category: "mode",
      aggregation: "sum",
      valueField: "weekly_shipments",
    },
  ];
  const seoul = k.assignments.find((a) => a.customer.name.startsWith("Seoul"))!;
  const boston = k.assignments.find((a) => a.customer.name.startsWith("Boston"))!;
  const dallas = k.assignments.find((a) => a.customer.name.startsWith("Dallas"))!;
  const chapters = [
    chapter(
      "kpi",
      "Every customer, served from the right node",
      `<p>Each arc is the lowest-cost option that still meets the customer's SLA, coloured by mode: <b style='color:${MODE_COLOR.Ground}'>ground</b>, <b style='color:${MODE_COLOR["Express air"]}'>express air</b>, <b style='color:${MODE_COLOR["International air"]}'>international air</b>.</p><p><b>${k.slaPct.toFixed(1)}%</b> of customers within SLA · <b>${k.avgTransit.toFixed(1)} d</b> average transit · <b>${money(k.freight)}</b> weekly freight · <b>${Math.round(k.co2e).toLocaleString("en-US")} kg</b> CO₂e.</p>${SAMPLE_NOTE}`,
      VIEWS.world,
      [["d2-nearest", 0]],
    ),
    chapter(
      "boston",
      "Nearest is often not optimal",
      `<p>For <b>${k.optimalNotNearest} of 47</b> customers the best source is not the closest node, mainly because product families are stocked at different sites.</p><p><b>Boston</b>: nearest is ${boston.nearest.code}, but it ships from ${boston.best.site.code} (${boston.best.mode}, ${boston.best.days} day). ${boston.reason}.</p>`,
      VIEWS.newEngland,
      [["d2-nearest", 1]],
    ),
    chapter(
      "dallas",
      "Mode selection on long lanes",
      `<p><b>Dallas</b> lab: ${dallas.reason}. It ships ${dallas.best.mode} from ${dallas.best.site.code} in ${dallas.best.days} day(s), because ground would miss the ${dallas.sla}-day SLA.</p>`,
      VIEWS.northAmerica,
      [["d2-nearest", 0]],
    ),
    chapter(
      "seoul",
      "The structural gap: South Korea",
      `<p><b>Seoul</b> is the one customer outside SLA. The Japan node serves Japan only, so the best option is ${seoul.best.site.code} by ${seoul.best.mode}: ${seoul.best.days} days against a ${seoul.sla}-day SLA.</p><p>A Korea or Taipei stocking point would close the gap.</p>`,
      VIEWS.apac,
      [["d2-nearest", 0]],
    ),
  ];
  const examples = [
    "Boston, MA",
    "New York, NY",
    "Portland, ME",
    "Baltimore, MD",
    "Dallas, TX",
    "Leiden, Netherlands",
    "Osaka, Japan",
    "Seoul, South Korea",
  ].map((n) => k.assignments.find((a) => a.customer.name === n)!);
  return project({
    name: "Nova Biomedical · Optimal Source vs Nearest (sample data)",
    description:
      "Optimal node-to-customer lanes by mode, nearest-node comparison and SLA exceptions.",
    view: VIEWS.newEngland,
    layers,
    legendTitle: "Outbound sourcing · sample data",
    storymap: story(
      "Which site should serve each customer?",
      "Optimal source by landed cost within SLA",
      chapters,
    ),
    widgets,
    dashboardColumns: 3,
    controlTower: ctConfig({
      lensId: "sourcing",
      title: "Sourcing",
      scenarios: ctScenarios(sets.opacityFor, false),
      panelTitle: "Sourcing",
      panelSubtitle: "Click any customer to see why it ships from where it does",
      sections: [
        {
          type: "card",
          title: "How a source is chosen",
          body: "Candidate nodes (stock + country) → feasible modes per lane → filter by SLA → minimise landed cost → compare with the nearest node → explain the difference.",
        },
        {
          type: "table",
          title: "Nearest ≠ optimal · selected customers",
          columns: ["Customer", "Nearest", "Optimal", "Mode", "Days", "Why"],
          rows: examples.map((a) => [
            a.customer.name.split(",")[0],
            a.nearest.code,
            a.best.site.code,
            a.best.mode,
            `${a.best.days}${a.withinSla ? "" : ` (SLA ${a.sla})`}`,
            a.reason,
          ]),
          highlightRows: examples.map((a, i) => (a.withinSla ? -1 : i)).filter((i) => i >= 0),
        },
      ],
      explainLayers: ["d2-customers", "d2-site-markers"],
      chapters,
      ask: commonAsk("d2-risk-outage"),
      legendTitle: "Outbound sourcing · sample data",
      legend: LEGEND_MODES,
    }),
  });
}

// ---------------------------------------------------------------------------
// Demo 3: New England van routes
// ---------------------------------------------------------------------------

interface Route {
  id: string;
  color: string;
  stops: string[];
}
const ROUTES: Route[] = [
  {
    id: "BIL-E-R1",
    color: "#22d3ee",
    stops: [
      "Lexington, MA",
      "Cambridge, MA",
      "Boston, MA",
      "Providence, RI",
      "Hartford, CT",
      "Worcester, MA",
    ],
  },
  { id: "BIL-E-R2", color: "#facc15", stops: ["Manchester, NH", "Portland, ME"] },
];

function demoRoutes(): GeoLibreProject {
  const depot = siteByCode("BIL-E");
  const routeFeatures: Feature[] = [];
  const directFeatures: Feature[] = [];
  const stopFeatures: Feature[] = [];
  const trips: Trip[] = [];
  const summary: string[] = [];
  let totalSaved = 0;
  for (const route of ROUTES) {
    const stops = route.stops.map(customerByName);
    const coords = [
      [depot.lng, depot.lat],
      ...stops.map((s) => [s.lng, s.lat]),
      [depot.lng, depot.lat],
    ];
    const routeKm = coords
      .slice(1)
      .reduce((n, p, i) => n + haversineKm(coords[i][1], coords[i][0], p[1], p[0]) * CIRCUITY, 0);
    const directKm = stops.reduce(
      (n, s) => n + 2 * haversineKm(depot.lat, depot.lng, s.lat, s.lng) * CIRCUITY,
      0,
    );
    const savedPct = Math.round((100 * (directKm - routeKm)) / directKm);
    totalSaved += directKm - routeKm;
    summary.push(
      `<li><b style='color:${route.color}'>${route.id}</b>: ${stops.length} stops · ${Math.round(routeKm)} km vs ${Math.round(directKm)} km direct (<b>${savedPct}% fewer km</b>)</li>`,
    );
    routeFeatures.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: coords.map(([lng, lat]) => [round(lng), round(lat)]),
      },
      properties: {
        route: route.id,
        sequence: ["BIL-E", ...stops.map((s) => s.name), "BIL-E"].join(" → "),
        stops: stops.length,
        route_km: Math.round(routeKm),
        direct_km: Math.round(directKm),
        saved_pct: savedPct,
        stroke: route.color,
        "stroke-width": 5,
      },
    });
    stops.forEach((s, i) => {
      stopFeatures.push(
        point(s.lng, s.lat, {
          label: `${route.id.slice(-2)}·${i + 1}  ${s.name}`,
          route: route.id,
          stop: i + 1,
          name: s.name,
          weekly_shipments: s.weekly,
        }),
      );
      directFeatures.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [round(depot.lng), round(depot.lat)],
            [round(s.lng), round(s.lat)],
          ],
        },
        properties: {
          route: route.id,
          stop: s.name,
          out_and_back_km: Math.round(
            2 * haversineKm(depot.lat, depot.lng, s.lat, s.lng) * CIRCUITY,
          ),
        },
      });
    });
    // Two vans per route, half a loop apart, so the animation always shows movement.
    trips.push(trip(coords, 900, 0), trip(coords, 900, 450));
  }
  const neSites = SITES.filter((s) => ["US"].includes(s.country));
  const layers = [
    geojsonLayer({
      id: "d3-stops",
      name: "Route stops (sequence)",
      data: fc(stopFeatures),
      style: {
        fillColor: "#f8fafc",
        strokeColor: "#0f172a",
        strokeWidth: 2,
        circleRadius: 6,
        labels: {
          ...DEFAULT_LAYER_STYLE.labels,
          enabled: true,
          field: "label",
          size: 13,
          color: "#f8fafc",
          haloColor: "#0f172a",
          haloWidth: 2,
          anchor: "left",
          offsetX: 1.2,
        },
      },
      popupTitle: "name",
      popupFields: [
        { field: "route", label: "Route" },
        { field: "stop", label: "Stop #" },
        { field: "weekly_shipments", label: "Weekly shipments" },
      ],
    }),
    tripsLayer("d3-vans", "Vans on route (animated)", trips, "#f8fafc", 6),
    geojsonLayer({
      id: "d3-routes",
      name: "Optimized van routes",
      data: fc(routeFeatures),
      style: { simpleStyleEnabled: true, strokeColor: "#22d3ee", strokeWidth: 5 },
      popupTitle: "route",
      popupFields: [
        { field: "sequence", label: "Sequence" },
        { field: "route_km", label: "Route km" },
        { field: "direct_km", label: "Direct out-and-back km" },
        { field: "saved_pct", label: "Saved (%)" },
      ],
    }),
    geojsonLayer({
      id: "d3-direct",
      name: "Direct out-and-back trips (before)",
      data: fc(directFeatures),
      opacity: 0.6,
      style: { strokeColor: "#64748b", strokeWidth: 1.5 },
      popupTitle: "stop",
      popupFields: [{ field: "out_and_back_km", label: "Out-and-back km" }],
    }),
    siteColumns({
      id: "d3-site-columns",
      name: "Nova sites – 3D (height = ERP + CRM users)",
      sites: neSites,
      radiusKm: () => 2.2,
      metresPerUser: 160,
    }),
  ];
  const chapters = [
    chapter(
      "before",
      "Before: one trip per customer",
      `<p>Delivering each New England customer directly from Billerica – Enterprise Rd means a separate out-and-back trip for every stop (grey lines).</p>${SAMPLE_NOTE}`,
      VIEWS.newEngland,
      [
        ["d3-direct", 0.9],
        ["d3-routes", 0],
        ["d3-vans", 0],
      ],
    ),
    chapter(
      "after",
      "After: two optimized van routes",
      `<p>Customers within 300 road km are grouped by angular sweep, capped at 450 km per driver shift, then sequenced with nearest-neighbour + 2-opt.</p><ul>${summary.join("")}</ul><p><b>${Math.round(totalSaved)} km saved per delivery cycle.</b></p>`,
      { ...VIEWS.newEngland, bearing: 10 },
      [
        ["d3-direct", 0.25],
        ["d3-routes", 1],
        ["d3-vans", 1],
      ],
    ),
    chapter(
      "r1",
      "BIL-E-R1: the main New England loop",
      "<p>Lexington → Cambridge → Boston → Providence → Hartford → Worcester → back to Billerica, inside one driver shift.</p>",
      { center: [-71.7, 42.05], zoom: 8.3, pitch: 60, bearing: -30 },
      [
        ["d3-direct", 0.25],
        ["d3-routes", 1],
        ["d3-vans", 1],
      ],
    ),
    chapter(
      "r2",
      "BIL-E-R2: north to Maine",
      "<p>Manchester, NH and Portland, ME on one run instead of two.</p>",
      { center: [-70.9, 43.15], zoom: 8.1, pitch: 60, bearing: 20 },
      [
        ["d3-direct", 0.25],
        ["d3-routes", 1],
        ["d3-vans", 1],
      ],
    ),
  ];
  const routeRows = ROUTES.map((route) => {
    const stops = route.stops.map(customerByName);
    const f = routeFeatures.find((x) => x.properties?.route === route.id)!.properties as Record<
      string,
      number
    >;
    return { route, stops, routeKm: f.route_km, directKm: f.direct_km, savedPct: f.saved_pct };
  });
  const totalRoute = routeRows.reduce((n, r) => n + r.routeKm, 0);
  const totalDirect = routeRows.reduce((n, r) => n + r.directKm, 0);
  // Manifest times: depart 07:30, 55 km/h average, 20 minutes per stop.
  const r1 = routeRows[0];
  const clock = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const manifest: Array<{ time: string; title: string; detail?: string }> = [];
  {
    let t = 7 * 60 + 30;
    let prev: { lat: number; lng: number } = depot;
    manifest.push({
      time: clock(t),
      title: "Depart Billerica – Enterprise Rd",
      detail: "Load pallets · Critical Care + Bioprocess",
    });
    r1.stops.forEach((st, i) => {
      t +=
        Math.round(((haversineKm(prev.lat, prev.lng, st.lat, st.lng) * CIRCUITY) / 55) * 60) +
        (i ? 20 : 0);
      manifest.push({
        time: clock(t),
        title: `${i + 1} · ${st.name}`,
        detail: `${st.segment} · ${st.weekly} pkgs`,
      });
      prev = st;
    });
    t +=
      Math.round(((haversineKm(prev.lat, prev.lng, depot.lat, depot.lng) * CIRCUITY) / 55) * 60) +
      20;
    manifest.push({
      time: clock(t),
      title: "Return to Billerica",
      detail: `${r1.routeKm} km total`,
    });
  }
  return project({
    name: "Nova Biomedical · New England Van Routes (sample data)",
    description: "Optimized multi-stop van routes from Billerica vs direct out-and-back delivery.",
    view: VIEWS.newEngland,
    layers,
    legendTitle: "Route optimization · sample data",
    storymap: story(
      "New England delivery routes",
      "Multi-stop route optimization from Billerica",
      chapters,
    ),
    controlTower: ctConfig({
      lensId: "routes",
      title: "Routes › Billerica – Enterprise Rd",
      scenarios: ctNormalOnly([
        {
          id: "routes",
          label: "Routes today",
          value: ROUTES.length,
          format: "int",
          detail: "vans",
        },
        {
          id: "stops",
          label: "Stops",
          value: routeRows.reduce((n, r) => n + r.stops.length, 0),
          format: "int",
          detail: "customers",
        },
        { id: "routekm", label: "Route km", value: totalRoute, format: "int", detail: "km" },
        {
          id: "directkm",
          label: "Direct km (before)",
          value: totalDirect,
          format: "int",
          detail: "km",
        },
        {
          id: "saved",
          label: "Saved per cycle",
          value: totalDirect - totalRoute,
          format: "int",
          detail: `km · ${Math.round((100 * (totalDirect - totalRoute)) / totalDirect)}% fewer`,
        },
        { id: "risk", label: "On-time risk", value: 0, format: "int", detail: "stops" },
      ]),
      panelTitle: "Route manifest",
      panelSubtitle: "450 km driver-shift cap · nearest-neighbour + 2-opt",
      sections: [
        {
          type: "list",
          title: "Routes",
          rows: routeRows.map((r) => ({
            badge: r.route.id.slice(-2),
            title: `${r.route.id} · ${r.route.id.endsWith("R1") ? "main New England loop" : "north to Maine"}`,
            detail: `${r.stops.length} stops · ${r.routeKm} km of a 450 km shift`,
            value: `−${r.savedPct}%`,
            valueLabel: `vs ${r.directKm} km direct`,
            tone: "good",
            location: [r.stops[0].lng, r.stops[0].lat],
            zoom: 9,
          })),
        },
        { type: "timeline", title: "BIL-E-R1 · today", rows: manifest },
        {
          type: "card",
          title: "In production",
          body: "Becomes a VRPTW solved over road-network travel times with vehicle capacity, driver hours, receiving windows and live traffic; dispatch goes to Process Weaver.",
        },
      ],
      explainLayers: ["d3-stops", "d3-routes"],
      chapters,
      ask: [
        {
          question: "How much does the loop save versus one trip per customer?",
          answer: `<p><b>${Math.round(totalDirect - totalRoute)} km per delivery cycle</b>: ${routeRows.map((r) => `${r.route.id} runs ${r.routeKm} km against ${r.directKm} km of out-and-back trips (−${r.savedPct}%)`).join("; ")}. Both routes fit inside one 450 km driver shift.</p>`,
          citations: ["route model §6.2 · straight-line × 1.25 circuity"],
        },
        ...commonAsk(),
      ],
      askPlaceholder: "Ask about today's routes…",
      legendTitle: "Route optimization · sample data",
      legend: {
        title: "Routes · sample data",
        items: [
          { label: "BIL-E-R1 · main New England loop", color: "#22d3ee", kind: "line" },
          { label: "BIL-E-R2 · north to Maine", color: "#facc15", kind: "line" },
          { label: "Direct out-and-back trips (before)", color: "#64748b", kind: "line" },
          { label: "Stop, numbered in sequence", color: "#f8fafc" },
          { label: "Van (animated)", color: "#f8fafc", kind: "ring" },
        ],
      },
    }),
  });
}

// ---------------------------------------------------------------------------
// Demo 4: Inbound supplier risk
// ---------------------------------------------------------------------------

/** Approximate sea lanes from Asia to Boston via Singapore, Suez and Gibraltar. */
const SEA_WAYPOINTS: Record<string, number[][]> = {
  "Penang, Malaysia": [
    [100.33, 5.41],
    [97.5, 6.0],
  ],
  "Hsinchu, Taiwan": [
    [120.97, 24.81],
    [119.5, 22.0],
    [113.5, 14.0],
    [105.5, 3.5],
    [103.8, 1.2],
    [97.5, 6.0],
  ],
  "Shenzhen, China": [
    [114.06, 22.54],
    [113.5, 14.0],
    [105.5, 3.5],
    [103.8, 1.2],
    [97.5, 6.0],
  ],
  "Suzhou, China": [
    [120.59, 31.3],
    [122.5, 30.0],
    [121.0, 24.0],
    [113.5, 14.0],
    [105.5, 3.5],
    [103.8, 1.2],
    [97.5, 6.0],
  ],
};
const SEA_COMMON = [
  [80.5, 5.7],
  [60.0, 13.0],
  [51.0, 12.5],
  [43.4, 12.6],
  [38.5, 20.0],
  [32.6, 29.9],
  [32.3, 31.3],
  [20.0, 34.5],
  [10.5, 37.5],
  [-5.6, 35.95],
  [-20.0, 37.0],
  [-45.0, 40.5],
  [-65.0, 41.5],
  [-70.5, 42.35],
];

function demoSupplierRisk(): GeoLibreProject {
  const flagged = SUPPLIERS.filter((s) => s.singleSource || s.days > LONG_LEAD_DAYS);
  const other = SUPPLIERS.filter((s) => !(s.singleSource || s.days > LONG_LEAD_DAYS));
  const laneRows = (list: Supplier[]) => list.map((s) => od(s, siteByCode(s.to)));
  const voyages = SUPPLIERS.filter((s) => s.mode === "Ocean").flatMap((s, i) => {
    const plant = siteByCode(s.to);
    const path = [...SEA_WAYPOINTS[s.city], ...SEA_COMMON, [plant.lng, plant.lat]];
    // Staggered departures; duration scaled to lead time (60 units = 1 s).
    return [trip(path, s.days * 30, i * 120)];
  });
  const plants = SITES.filter((s) =>
    ["WAL", "BIL-E", "BIL-M", "BIL-L", "NOR", "WES", "WIM"].includes(s.code),
  );
  const layers = [
    supplierLayer("d4-suppliers"),
    siteMarkers("d4-site-markers", plants, 5),
    tripsLayer("d4-voyages", "Ocean shipments in transit (animated)", voyages, "#fbbf24", 5),
    arcLayer({
      id: "d4-lanes-flagged",
      name: `Flagged inbound lanes (${flagged.length}) – single source / long lead`,
      rows: laneRows(flagged),
      color: "#ef4444",
      width: 3,
    }),
    arcLayer({
      id: "d4-lanes-ok",
      name: `Other inbound lanes (${other.length})`,
      rows: laneRows(other),
      color: "#f59e0b",
      width: 1.5,
    }),
  ];
  const widgets: DashboardWidget[] = [
    {
      id: "w-list",
      layerId: "d4-suppliers",
      type: "list",
      title: "Inbound lanes by lead time",
      listFields: ["material", "location", "receiving_site", "mode", "lead_time_days", "flags"],
      sortBy: "lead_time_days",
      sortDir: "desc",
      limit: 14,
    },
    {
      id: "w-risk",
      layerId: "d4-suppliers",
      type: "pie",
      title: "Lanes by risk",
      category: "risk",
      aggregation: "count",
    },
    indicator(
      "w-lead",
      "d4-suppliers",
      "Longest lead time",
      "lead_time_days",
      "max",
      "",
      " days",
      "#ef4444",
    ),
  ];
  const chapters = [
    chapter(
      "world",
      "Every inbound lane, flagged by risk",
      `<p>${SUPPLIERS.length} supplier lanes into Nova plants. <b style='color:#ef4444'>${flagged.length} are flagged</b> as single-source, long lead time (&gt; ${LONG_LEAD_DAYS} days), or both.</p>${SAMPLE_NOTE}`,
      { center: [40, 30], zoom: 1.5, pitch: 20, bearing: 0 },
    ),
    chapter(
      "asia",
      "Asian electronics and cells move by ocean",
      "<p>PCB assemblies, sensor chips, motors and lithium cells come from Malaysia, Taiwan and China, 35–39 days door to door. Four of them are single-source.</p><p>The animation shows shipments on the water right now.</p>",
      { center: [105, 15], zoom: 3, pitch: 35, bearing: 0 },
    ),
    chapter(
      "suez",
      "A single chokepoint",
      "<p>Every Asian lane shares the same sea route via Suez. One disruption here delays four critical inputs at once: an early-warning case for safety stock or a second source.</p>",
      { center: [35, 25], zoom: 3.6, pitch: 40, bearing: -10 },
    ),
    chapter(
      "us",
      "Domestic lanes: short, but some still single-source",
      "<p>Precision optics (Rochester) and photometric dyes (Lewiston) arrive in a day, yet each depends on one supplier.</p>",
      { center: [-76, 41.5], zoom: 4.8, pitch: 40, bearing: 0 },
    ),
  ];
  const sorted = [...SUPPLIERS].sort((a, b) => b.days - a.days);
  return project({
    name: "Nova Biomedical · Supplier Lane Risk (sample data)",
    description:
      "Inbound supplier lanes flagged for single-source and long-lead risk, with animated ocean shipments.",
    view: { center: [40, 30], zoom: 1.5, pitch: 20, bearing: 0 },
    layers,
    legendTitle: "Inbound supplier risk · sample data",
    storymap: story("Inbound supplier lane risk", "Procurement early warning", chapters),
    widgets,
    dashboardColumns: 2,
    controlTower: ctConfig({
      lensId: "inbound",
      title: "Inbound › Supplier lanes",
      scenarios: ctNormalOnly(
        [
          {
            id: "lanes",
            label: "Inbound lanes",
            value: SUPPLIERS.length,
            format: "int",
            detail: "active",
          },
          {
            id: "flagged",
            label: "Flagged",
            value: flagged.length,
            format: "int",
            detail: `of ${SUPPLIERS.length}`,
            higherIsWorse: true,
          },
          {
            id: "single",
            label: "Single source",
            value: SUPPLIERS.filter((x) => x.singleSource).length,
            format: "int",
            detail: "lanes",
          },
          {
            id: "long",
            label: `Long lead (> ${LONG_LEAD_DAYS} d)`,
            value: SUPPLIERS.filter((x) => x.days > LONG_LEAD_DAYS).length,
            format: "int",
            detail: "ocean",
          },
          {
            id: "water",
            label: "On the water now",
            value: SUPPLIERS.filter((x) => x.mode === "Ocean").length,
            format: "int",
            detail: "shipments",
          },
          {
            id: "longest",
            label: "Longest lead",
            value: Math.max(...SUPPLIERS.map((x) => x.days)),
            format: "int",
            detail: "days",
          },
        ],
        exceptionsFor(normal).filter((e) => e.badge === "IN"),
      ),
      panelTitle: "Inbound lanes",
      panelSubtitle: "Sorted by lead time · flags: single source, long lead, receiving-site outage",
      sections: [
        {
          type: "table",
          title: "All lanes",
          columns: ["Material", "From → To", "Mode", "Days", "Flags"],
          rows: sorted.map((x) => [
            x.material,
            `${x.city.split(",")[0]} → ${x.to}`,
            x.mode,
            String(x.days),
            [x.singleSource ? "Single source" : "", x.days > LONG_LEAD_DAYS ? "Long lead" : ""]
              .filter(Boolean)
              .join(", ") || "—",
          ]),
          highlightRows: sorted
            .map((x, i) => (x.singleSource && x.days > LONG_LEAD_DAYS ? i : -1))
            .filter((i) => i >= 0),
        },
        {
          type: "card",
          title: "Buyer action",
          tone: "warning",
          body: "Qualify a second source for <b>sensor chips</b> (Hsinchu → WAL, 36 d) and <b>lithium cells</b> (Suzhou → BIL-L, 35 d). Both single-source, both via Suez.",
        },
      ],
      explainLayers: ["d4-suppliers", "d4-site-markers"],
      chapters,
      ask: [
        {
          question: "What happens if Suez closes for a week?",
          answer: `<p>All four Asian lanes (PCB assemblies, sensor chips, motors, lithium cells) share the Suez route, so a 7-day closure pushes four inputs out by a week at once. Safety stock at Billerica Manning Rd covers about 12 days of PCB demand, so production is at risk in week 3. Three of the four lanes are single-source, so there is no alternate vendor to pull forward.</p>`,
          citations: [
            "lane routing: Singapore → Suez → Gibraltar (sample)",
            "safety stock: illustrative",
          ],
          camera: { center: [35, 25], zoom: 3.4, pitch: 35, bearing: -10 },
        },
        ...commonAsk(),
      ],
      askPlaceholder: "Ask about inbound risk…",
      legendTitle: "Inbound supplier risk · sample data",
      legend: {
        title: "Inbound · sample data",
        items: [
          { label: "Flagged lane · single source or long lead", color: "#ef4444", kind: "line" },
          { label: "Other inbound lane", color: "#f59e0b", kind: "line" },
          { label: "Ocean shipment in transit (animated)", color: "#fbbf24" },
          { label: "Single source + long lead", color: "#ef4444" },
          { label: "Long lead time", color: "#f97316" },
          { label: "Single source", color: "#facc15" },
          { label: "Low risk", color: "#a3a3a3" },
        ],
      },
    }),
  });
}

// ---------------------------------------------------------------------------
// Demo 5: Billerica outage what-if
// ---------------------------------------------------------------------------

function demoOutage(): GeoLibreProject {
  const sets = scenarioLayerSets("d5");
  const layers = [
    customerLayer("d5-customers", "Customers (sample)", normal.assignments),
    siteMarkers("d5-site-markers", SITES),
    ...sets.layers,
  ];
  const only = (key: string): Array<[string, number]> => Object.entries(sets.opacityFor(key));
  const NORMAL_SET = "normal";
  const OUTAGE_SET = "outage";
  const RECOVERY_SET = "contingency";
  // Story text is sanitized HTML without tables, so the KPIs are plain lines.
  const kpiTable = (k: Kpis, base?: Kpis) => {
    const delta = (v: number, b: number) =>
      base ? ` (${v >= b ? "+" : ""}${Math.round(((v - b) / b) * 100)}% vs normal)` : "";
    return `<p>Customers within SLA: <b>${k.slaPct.toFixed(1)}%</b> (${k.withinSla}/47)<br>Avg transit: <b>${k.avgTransit.toFixed(1)} days</b><br>Weekly freight: <b>${money(k.freight)}</b>${delta(k.freight, base?.freight ?? 0)}<br>Weekly CO₂e: <b>${Math.round(k.co2e).toLocaleString("en-US")} kg</b>${delta(k.co2e, base?.co2e ?? 0)}</p>`;
  };
  const outageMisses = outage.assignments.filter((a) => !a.withinSla).length;
  const chapters = [
    chapter(
      "normal",
      "Normal operations",
      `<p>Billerica – Enterprise Rd ships Critical Care and Bioprocess to most North American customers.</p>${kpiTable(normal)}${SAMPLE_NOTE}`,
      VIEWS.northAmerica,
      only(NORMAL_SET),
    ),
    chapter(
      "down",
      "Billerica DC goes offline",
      `<p>The engine re-plans instantly: Critical Care and Bioprocess demand falls back to the UK hub by international air. <b style='color:#ef4444'>${outageMisses} customers</b> fall outside SLA.</p>${kpiTable(outage, normal)}`,
      { ...VIEWS.northAmerica, zoom: 2.6, center: [-50, 40] },
      only(OUTAGE_SET),
    ),
    chapter(
      "impact",
      "The impact lands on hospitals",
      "<p>Hospital Critical Care customers have a 2-day SLA; a transatlantic air lane with customs takes 3. Every red ring is a hospital that would wait longer for analyzers and consumables.</p>",
      VIEWS.northAmerica,
      only(OUTAGE_SET),
    ),
    chapter(
      "recover",
      "Activate Norwood as the contingency DC",
      `<p>Pre-positioning Critical Care and Bioprocess stock at Norwood restores service at near-normal cost.</p>${kpiTable(recovery, normal)}<p>This is the quantified case for a contingency stocking policy, the same plan the Continuity Command Center would execute.</p>`,
      { ...VIEWS.newEngland, zoom: 6.6, center: [-71.5, 42.3] },
      only(RECOVERY_SET),
    ),
    chapter(
      "summary",
      "Recovered network",
      "<p>Same customers, same SLAs: served from Norwood while Billerica is down.</p>",
      VIEWS.northAmerica,
      only(RECOVERY_SET),
    ),
  ];
  return project({
    name: "Nova Biomedical · What If Billerica Goes Down? (sample data)",
    description: "Disruption what-if: Billerica DC outage and Norwood contingency, re-optimized.",
    view: VIEWS.northAmerica,
    layers,
    legendTitle: "Disruption what-if · sample data",
    storymap: story(
      "What if Billerica goes down?",
      "Disruption what-if and contingency activation",
      chapters,
    ),
    controlTower: ctConfig({
      lensId: "scenarios",
      title: "Scenarios",
      scenarios: ctScenarios(sets.opacityFor),
      panelTitle: "What-if",
      panelSubtitle: "Switch a scenario above · every KPI is compared with normal operations",
      sections: [
        {
          type: "table",
          title: "Scenario comparison",
          columns: ["Scenario", "Within SLA", "Transit", "Freight / wk", "CO₂e / wk"],
          rows: SCENARIO_RUNS.map(([sc, k]) => [
            sc.label,
            `${k.slaPct.toFixed(1)}% (${k.withinSla}/47)`,
            `${k.avgTransit.toFixed(1)} d`,
            money(k.freight),
            `${Math.round(k.co2e).toLocaleString("en-US")} kg`,
          ]),
          highlightRows: [1],
        },
        {
          type: "card",
          title: "Key insight",
          body: `A Billerica outage moves Critical Care and Bioprocess demand to the UK hub by international air: <b>${misses(outage).length} customers</b> fall outside SLA and freight rises <b>${pctUp(outage.freight, normal.freight)}</b>. Pre-positioning contingency stock at Norwood returns the network to <b>${recovery.slaPct.toFixed(1)}%</b> at near-normal cost. This is the quantified case for a contingency stocking policy, and it ties directly to the Continuity Command Center.`,
          tone: "accent",
        },
      ],
      explainLayers: ["d5-customers", "d5-site-markers"],
      chapters,
      ask: commonAsk("d5-risk-outage"),
      askPlaceholder: "Ask what-if…",
      legendTitle: "Disruption what-if · sample data",
      legend: LEGEND_MODES,
    }),
  });
}

// ---------------------------------------------------------------------------
// Demo 6: Installed base & consumables demand
// ---------------------------------------------------------------------------

/** Deterministic PRNG so regenerating gives identical files. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const METROS: Array<[string, number, number, number, string]> = [
  ["New York", 40.71, -74.0, 40, "Northeast"],
  ["Los Angeles", 34.05, -118.24, 28, "West"],
  ["Chicago", 41.88, -87.63, 24, "Midwest"],
  ["Houston", 29.76, -95.37, 20, "South"],
  ["Dallas", 32.78, -96.8, 18, "South"],
  ["Philadelphia", 39.95, -75.17, 18, "Northeast"],
  ["Boston", 42.36, -71.06, 22, "Northeast"],
  ["Atlanta", 33.75, -84.39, 16, "South"],
  ["Miami", 25.76, -80.19, 15, "South"],
  ["Washington", 38.91, -77.04, 16, "Northeast"],
  ["Phoenix", 33.45, -112.07, 12, "West"],
  ["San Francisco", 37.77, -122.42, 15, "West"],
  ["Seattle", 47.61, -122.33, 12, "West"],
  ["Detroit", 42.33, -83.05, 11, "Midwest"],
  ["Minneapolis", 44.98, -93.27, 11, "Midwest"],
  ["San Diego", 32.72, -117.16, 10, "West"],
  ["Denver", 39.74, -104.99, 10, "West"],
  ["St. Louis", 38.63, -90.2, 9, "Midwest"],
  ["Baltimore", 39.29, -76.61, 10, "Northeast"],
  ["Cleveland", 41.5, -81.69, 10, "Midwest"],
  ["Pittsburgh", 40.44, -80.0, 9, "Northeast"],
  ["Nashville", 36.16, -86.78, 9, "South"],
  ["Charlotte", 35.23, -80.84, 8, "South"],
  ["Tampa", 27.95, -82.46, 8, "South"],
  ["Portland OR", 45.52, -122.68, 7, "West"],
  ["Salt Lake City", 40.76, -111.89, 6, "West"],
  ["Kansas City", 39.1, -94.58, 6, "Midwest"],
  ["Columbus", 39.96, -83.0, 7, "Midwest"],
  ["Indianapolis", 39.77, -86.16, 7, "Midwest"],
  ["New Orleans", 29.95, -90.07, 6, "South"],
  ["Raleigh-Durham", 35.99, -78.9, 7, "South"],
  ["Hartford", 41.77, -72.67, 6, "Northeast"],
  ["Providence", 41.82, -71.41, 5, "Northeast"],
  ["Albany", 42.65, -73.75, 4, "Northeast"],
  ["Buffalo", 42.89, -78.88, 5, "Northeast"],
  ["Milwaukee", 43.04, -87.91, 6, "Midwest"],
  ["Oklahoma City", 35.47, -97.52, 5, "South"],
  ["Las Vegas", 36.17, -115.14, 6, "West"],
  ["Sacramento", 38.58, -121.49, 6, "West"],
  ["Albuquerque", 35.08, -106.65, 4, "West"],
  ["Omaha", 41.26, -95.93, 4, "Midwest"],
  ["Birmingham", 33.52, -86.8, 5, "South"],
  ["Louisville", 38.25, -85.76, 5, "South"],
  ["Richmond", 37.54, -77.44, 5, "South"],
  ["Portland ME", 43.66, -70.26, 3, "Northeast"],
];

function demoInstalledBase(): GeoLibreProject {
  const rand = mulberry32(20261118);
  const features: Feature[] = [];
  const weightTotal = METROS.reduce((n, m) => n + m[3], 0);
  const HOSPITALS = 640;
  let n = 0;
  for (const [metro, lat, lng, weight, region] of METROS) {
    const count = Math.max(3, Math.round((weight / weightTotal) * HOSPITALS));
    for (let i = 0; i < count; i += 1) {
      n += 1;
      const r = 0.55 * Math.sqrt(rand());
      const theta = 2 * Math.PI * rand();
      const beds = Math.round(80 + rand() ** 2 * 900);
      const analyzers = Math.max(1, Math.round(beds / 180 + rand() * 2));
      const meters = Math.round(beds / 9 + rand() * 20);
      const cartridges = analyzers * Math.round(22 + rand() * 14);
      const strips = meters * Math.round(240 + rand() * 160);
      const monthly = Math.round(cartridges * 310 + strips * 0.42);
      const months = Math.round(rand() * 96);
      features.push(
        point(
          lng + (r * Math.cos(theta)) / Math.cos((lat * Math.PI) / 180),
          lat + r * Math.sin(theta),
          {
            name: `${metro} Hospital ${String(i + 1).padStart(2, "0")} (sample)`,
            metro,
            region,
            beds,
            blood_gas_analyzers: analyzers,
            poc_glucose_meters: meters,
            cartridges_per_month: cartridges,
            test_strips_per_month: strips,
            consumables_usd_month: monthly,
            installed_months_ago: months,
            service_due: months % 12 >= 10 ? "Due within 60 days" : "Current",
          },
        ),
      );
    }
  }
  // A 0–1 demand index for heat-map weighting (raw dollars saturate the ramp).
  const maxMonthly = Math.max(...features.map((f) => Number(f.properties?.consumables_usd_month)));
  for (const f of features) {
    f.properties!.demand_index = round(Number(f.properties?.consumables_usd_month) / maxMonthly, 3);
  }
  const supplyNodes = SITES.filter((s) => ["BIL-E", "NOR", "WES"].includes(s.code));
  const layers = [
    siteMarkers("d6-site-markers", supplyNodes, 4),
    geojsonLayer({
      id: "d6-hospitals",
      name: `Hospitals with Nova analyzers (${features.length}, sample)`,
      data: fc(features),
      opacity: 0,
      style: {
        ...categorized("service_due", [
          ["Current", "#38bdf8"],
          ["Due within 60 days", "#f97316"],
        ]),
        circleRadius: 4,
        fillOpacity: 0.9,
        strokeColor: "#0f172a",
        strokeWidth: 0.5,
      },
      popupTitle: "name",
      popupFields: [
        { field: "beds", label: "Beds" },
        { field: "blood_gas_analyzers", label: "Blood-gas analyzers" },
        { field: "poc_glucose_meters", label: "Point-of-care meters" },
        { field: "cartridges_per_month", label: "Sensor cartridges / month" },
        { field: "test_strips_per_month", label: "Test strips / month" },
        { field: "consumables_usd_month", label: "Consumables (USD / month)" },
        { field: "service_due", label: "Field service" },
      ],
    }),
    geojsonLayer({
      id: "d6-heatmap",
      name: "Consumables demand – heat map",
      data: fc(features),
      opacity: 0,
      style: {
        pointRenderer: "heatmap",
        heatmapRadius: 26,
        heatmapIntensity: 0.7,
        heatmapColorRamp: "inferno",
        heatmapWeightProperty: "demand_index",
      },
    }),
    (() => {
      const hex = createDeckVizStoreLayer({
        id: "d6-hexbins",
        name: "Consumables demand – 3D hexbins",
        rows: features.map((f) => {
          const [lng, lat] = (f.geometry as { coordinates: number[] }).coordinates;
          return {
            lng,
            lat,
            usd: (f.properties as { consumables_usd_month: number }).consumables_usd_month,
          };
        }),
        config: {
          layerKind: "hexagon",
          format: "csv-rows",
          fieldMapping: { lng: "lng", lat: "lat", weight: "usd" },
          style: {
            color: "#f97316",
            radius: 40,
            cellSize: 45000,
            lineWidth: 2,
            extruded: true,
            elevationScale: 250,
          },
        },
      });
      return hex;
    })(),
  ];
  const total = features.reduce(
    (s, f) => s + Number((f.properties as { consumables_usd_month: number }).consumables_usd_month),
    0,
  );
  const widgets: DashboardWidget[] = [
    indicator("w-hosp", "d6-hospitals", "Hospitals (sample)", "beds", "count"),
    indicator(
      "w-an",
      "d6-hospitals",
      "Blood-gas analyzers installed",
      "blood_gas_analyzers",
      "sum",
    ),
    indicator(
      "w-usd",
      "d6-hospitals",
      "Consumables demand / month",
      "consumables_usd_month",
      "sum",
      "$",
      "",
      "#f97316",
    ),
    {
      id: "w-region",
      layerId: "d6-hospitals",
      type: "bar",
      title: "Monthly consumables by region (USD)",
      category: "region",
      aggregation: "sum",
      valueField: "consumables_usd_month",
    },
    {
      id: "w-service",
      layerId: "d6-hospitals",
      type: "pie",
      title: "Field service status",
      category: "service_due",
      aggregation: "count",
    },
    {
      id: "w-top",
      layerId: "d6-hospitals",
      type: "list",
      title: "Largest consumable accounts",
      listFields: ["name", "blood_gas_analyzers", "consumables_usd_month"],
      sortBy: "consumables_usd_month",
      sortDir: "desc",
      limit: 10,
    },
  ];
  const chapters = [
    chapter(
      "hex",
      "Where the consumables demand is",
      `<p>${features.length} sample US hospitals running Nova blood-gas analyzers and point-of-care meters. Each placed instrument pulls a steady flow of sensor cartridges and test strips.</p><p>Column height = monthly consumables demand (about <b>${money(total)}</b> a month in this sample).</p>${SAMPLE_NOTE}`,
      { center: [-92, 38], zoom: 3.4, pitch: 50, bearing: -15 },
      [
        ["d6-hexbins", 1],
        ["d6-heatmap", 0],
        ["d6-hospitals", 0],
      ],
    ),
    chapter(
      "northeast",
      "The Northeast corridor",
      "<p>Boston to Washington carries the densest demand, all within next-day ground reach of Billerica, Norwood and Westbrook.</p>",
      { center: [-74.5, 41.2], zoom: 5.6, pitch: 55, bearing: -25 },
      [
        ["d6-hexbins", 1],
        ["d6-heatmap", 0],
        ["d6-hospitals", 0],
      ],
    ),
    chapter(
      "heat",
      "Demand density as a heat map",
      "<p>The same data as a weighted heat map, the view a planner would use to decide where to forward-stock consumables.</p>",
      { center: [-92, 38], zoom: 3.6, pitch: 0, bearing: 0 },
      [
        ["d6-hexbins", 0],
        ["d6-heatmap", 1],
        ["d6-hospitals", 0],
      ],
    ),
    chapter(
      "service",
      "Accounts and field service",
      "<p>Every hospital is clickable: beds, installed analyzers, monthly cartridges and strips, and whether a field service visit is due (orange).</p>",
      { center: [-87.7, 41.9], zoom: 8, pitch: 30, bearing: 0 },
      [
        ["d6-hexbins", 0],
        ["d6-heatmap", 0],
        ["d6-hospitals", 1],
      ],
    ),
  ];
  const byMetro = [
    ...METROS.map(
      ([metro]) =>
        [
          metro,
          features
            .filter((f) => f.properties?.metro === metro)
            .reduce((n, f) => n + Number(f.properties?.consumables_usd_month), 0),
        ] as [string, number],
    ),
  ].sort((a, b) => b[1] - a[1]);
  const analyzers = features.reduce((n, f) => n + Number(f.properties?.blood_gas_analyzers), 0);
  const due = features.filter((f) => f.properties?.service_due !== "Current").length;
  const northeast = features
    .filter((f) => f.properties?.region === "Northeast")
    .reduce((n, f) => n + Number(f.properties?.consumables_usd_month), 0);
  const west = features
    .filter((f) => f.properties?.region === "West")
    .reduce((n, f) => n + Number(f.properties?.consumables_usd_month), 0);
  return project({
    name: "Nova Biomedical · Installed Base & Consumables Demand (sample data)",
    description: "Sample US installed base of Nova analyzers and the consumables demand it drives.",
    view: { center: [-92, 38], zoom: 3.4, pitch: 50, bearing: -15 },
    layers,
    legendTitle: "Installed base · sample data",
    storymap: story(
      "Installed base & consumables demand",
      "Where Nova's instruments pull consumables",
      chapters,
    ),
    widgets,
    dashboardColumns: 3,
    controlTower: ctConfig({
      lensId: "installed",
      title: "Installed base › Consumables demand",
      scenarios: ctNormalOnly([
        {
          id: "hosp",
          label: "Hospitals (sample)",
          value: features.length,
          format: "int",
          detail: "accounts",
        },
        {
          id: "an",
          label: "Analyzers installed",
          value: analyzers,
          format: "int",
          detail: "units",
        },
        { id: "usd", label: "Consumables / month", value: total, format: "usd" },
        {
          id: "ne",
          label: "Northeast share",
          value: (100 * northeast) / total,
          format: "pct",
          detail: "next-day ground",
        },
        {
          id: "west",
          label: "West share",
          value: (100 * west) / total,
          format: "pct",
          detail: "3–5 d ground",
        },
        {
          id: "due",
          label: "Service due ≤ 60 d",
          value: due,
          format: "int",
          detail: "sites",
          higherIsWorse: true,
        },
      ]),
      panelTitle: "Where the demand is",
      panelSubtitle: "Monthly sensor cartridges + test strips, by metro",
      views: [
        { label: "US", camera: { center: [-92, 38], zoom: 3.4, pitch: 50, bearing: -15 } },
        {
          label: "Northeast",
          camera: { center: [-74.5, 41.2], zoom: 5.6, pitch: 55, bearing: -25 },
        },
        { label: "West", camera: { center: [-118, 37], zoom: 4.6, pitch: 50, bearing: 0 } },
        { label: "South", camera: { center: [-90, 31], zoom: 4.6, pitch: 50, bearing: 0 } },
        { label: "Midwest", camera: { center: [-88, 41.5], zoom: 5, pitch: 50, bearing: 0 } },
      ],
      sections: [
        {
          type: "bars",
          title: "Top metros",
          rows: byMetro.slice(0, 8).map(([metro, usd]) => ({
            label: metro,
            value: usd,
            display: `${money(usd / 1000)}k`,
          })),
        },
        {
          type: "card",
          title: "Planner insight",
          body: `The Northeast carries <b>${Math.round((100 * northeast) / total)}%</b> of monthly demand, all inside next-day ground reach of Billerica, Norwood and Westbrook. The West is <b>${Math.round((100 * west) / total)}%</b> and ships 3–5 days by ground: a candidate for a forward stocking location.`,
          tone: "accent",
        },
        {
          type: "list",
          title: "Field service",
          count: "next 60 days",
          rows: [
            {
              badge: String(due),
              title: "Preventive-maintenance visits due",
              detail: "Salesforce work orders (sample)",
              value: "Plan",
              valueLabel: "with van routes",
              tone: "warning",
            },
          ],
        },
      ],
      explainLayers: ["d6-hospitals", "d6-site-markers"],
      chapters,
      ask: [
        {
          question: "Where should a West Coast forward stocking location go?",
          answer: `<p>Los Angeles. The West is <b>${Math.round((100 * west) / total)}%</b> of monthly consumables demand and LA alone is <b>${money(byMetro.find((m) => m[0] === "Los Angeles")![1] / 1000)}k</b>, with San Diego, Phoenix and the Bay Area within next-day ground. Today those accounts ship 3–5 days by ground from Billerica.</p>`,
          citations: [
            "installed base: sample of 640 hospitals",
            "demand: cartridges × $310 + strips × $0.42 (illustrative)",
          ],
          camera: { center: [-118, 36], zoom: 4.8, pitch: 50, bearing: 0 },
        },
        ...commonAsk(),
      ],
      askPlaceholder: "Ask about the installed base…",
      legendTitle: "Installed base · sample data",
      legend: {
        title: "Consumables demand · sample",
        items: [
          { label: "3D hexbin · height = monthly consumables (USD)", color: "#f97316" },
          { label: "Field service due within 60 days", color: "#f97316", kind: "ring" },
          { label: "Current", color: "#38bdf8" },
          { label: "Supply node (BIL-E · NOR · WES)", color: "#0ea5e9" },
        ],
      },
    }),
  });
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const DEMOS: Array<[string, () => GeoLibreProject]> = [
  ["1-nova-global-network", demoGlobalNetwork],
  ["2-nova-optimal-sourcing", demoSourcing],
  ["3-nova-new-england-routes", demoRoutes],
  ["4-nova-supplier-risk", demoSupplierRisk],
  ["5-nova-billerica-outage", demoOutage],
  ["6-nova-installed-base", demoInstalledBase],
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [file, build] of DEMOS) {
  const text = serializeProject(build());
  // Round-trip through the app's own parser so a malformed file fails here.
  const parsed = parseProject(text);
  writeFileSync(join(OUT_DIR, `${file}.geoverse.json`), text);
  console.log(
    `${file}.geoverse.json  ${parsed.layers.length} layers  ${(text.length / 1024).toFixed(0)} KB`,
  );
}
const fmt = (k: Kpis) =>
  `${k.scenario.label.padEnd(40)} SLA ${k.slaPct.toFixed(1)}% (${k.withinSla}/47)  transit ${k.avgTransit.toFixed(2)} d  freight ${money(k.freight)}  CO2e ${Math.round(k.co2e)} kg  optimal≠nearest ${k.optimalNotNearest}`;
console.log(`\n${fmt(normal)}\n${fmt(outage)}\n${fmt(recovery)}`);
