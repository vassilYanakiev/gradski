import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import Papa from "papaparse";

const STATIC_GTFS_URL = "https://gtfs.sofiatraffic.bg/api/v1/static";
const OUT_DIR = path.resolve("public", "data");
const OUT_FILE = path.join(OUT_DIR, "gradski-data.json");

function parseCsv(text) {
  return Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  }).data;
}

async function readCsv(zip, name) {
  const file = zip.file(name);
  if (!file) {
    throw new Error(`Missing ${name} in GTFS archive`);
  }

  return parseCsv(await file.async("string"));
}

function parseTimeToSeconds(value) {
  if (!value) return 0;
  const [hours = "0", minutes = "0", seconds = "0"] = value.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function parseDateKey(value) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function addService(servicesByDate, dateKey, serviceIndex) {
  let services = servicesByDate.get(dateKey);
  if (!services) {
    services = new Set();
    servicesByDate.set(dateKey, services);
  }
  services.add(serviceIndex);
}

function removeService(servicesByDate, dateKey, serviceIndex) {
  const services = servicesByDate.get(dateKey);
  if (services) {
    services.delete(serviceIndex);
  }
}

function normalizeTranslationKey(tableName, fieldName, language) {
  return `${tableName || ""}:${fieldName || ""}:${language || ""}`.toLowerCase();
}

function buildTranslations(rows) {
  const byRecord = new Map();
  const byFieldValue = new Map();

  for (const row of rows) {
    const key = normalizeTranslationKey(row.table_name, row.field_name, row.language);
    if (!key.includes(":en")) continue;

    const translation = row.translation?.trim();
    if (!translation) continue;

    if (row.record_id) {
      byRecord.set(`${key}:${row.record_id}`, translation);
    }

    if (row.field_value) {
      byFieldValue.set(`${key}:${row.field_value}`, translation);
    }
  }

  return { byRecord, byFieldValue };
}

function translatedName(translations, tableName, fieldName, id, bgValue) {
  const key = normalizeTranslationKey(tableName, fieldName, "en");
  return (
    translations.byRecord.get(`${key}:${id}`) ||
    translations.byFieldValue.get(`${key}:${bgValue}`) ||
    undefined
  );
}

function serviceIdFactory() {
  const serviceIds = [];
  const serviceIndexById = new Map();

  return {
    serviceIds,
    get(serviceId) {
      if (!serviceIndexById.has(serviceId)) {
        serviceIndexById.set(serviceId, serviceIds.length);
        serviceIds.push(serviceId);
      }
      return serviceIndexById.get(serviceId);
    },
  };
}

function routeTypeName(routeType) {
  switch (Number(routeType)) {
    case 0:
      return "tram";
    case 1:
      return "metro";
    case 3:
      return "bus";
    case 11:
      return "trolleybus";
    default:
      return "transit";
  }
}

async function main() {
  console.log(`Fetching ${STATIC_GTFS_URL}`);
  const response = await fetch(STATIC_GTFS_URL);
  if (!response.ok) {
    throw new Error(`${response.url}: ${response.status} ${response.statusText}`);
  }

  const archive = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(Buffer.from(archive));

  console.log("Parsing GTFS tables");
  const [
    agencyRows,
    stopRows,
    routeRows,
    tripRows,
    stopTimeRows,
    calendarRows,
    calendarDateRows,
    translationRows,
  ] = await Promise.all([
    readCsv(zip, "agency.txt"),
    readCsv(zip, "stops.txt"),
    readCsv(zip, "routes.txt"),
    readCsv(zip, "trips.txt"),
    readCsv(zip, "stop_times.txt"),
    zip.file("calendar.txt") ? readCsv(zip, "calendar.txt") : Promise.resolve([]),
    zip.file("calendar_dates.txt") ? readCsv(zip, "calendar_dates.txt") : Promise.resolve([]),
    zip.file("translations.txt") ? readCsv(zip, "translations.txt") : Promise.resolve([]),
  ]);

  const translations = buildTranslations(translationRows);
  const serviceFactory = serviceIdFactory();

  const stops = [];
  const stopIndexById = new Map();

  for (const row of stopRows) {
    const locationType = row.location_type || "0";
    const lat = Number(row.stop_lat);
    const lon = Number(row.stop_lon);
    if (!row.stop_id || locationType !== "0" || Number.isNaN(lat) || Number.isNaN(lon)) {
      continue;
    }

    const bgName = row.stop_name?.trim() || row.stop_id;
    stopIndexById.set(row.stop_id, stops.length);
    stops.push({
      id: row.stop_id,
      code: row.stop_code || "",
      names: {
        bg: bgName,
        en: translatedName(translations, "stops", "stop_name", row.stop_id, bgName),
      },
      lat,
      lon,
      parentId: row.parent_station || "",
    });
  }

  const routes = [];
  const routeIndexById = new Map();

  for (const row of routeRows) {
    if (!row.route_id) continue;
    const bgLongName = row.route_long_name?.trim() || "";
    routeIndexById.set(row.route_id, routes.length);
    routes.push({
      id: row.route_id,
      shortName: row.route_short_name?.trim() || row.route_id,
      names: {
        bg: bgLongName,
        en: translatedName(translations, "routes", "route_long_name", row.route_id, bgLongName),
      },
      type: Number(row.route_type || 3),
      typeName: routeTypeName(row.route_type),
      color: row.route_color || "",
      textColor: row.route_text_color || "",
    });
  }

  const tripsById = new Map();

  for (const row of tripRows) {
    const route = routeIndexById.get(row.route_id);
    if (!row.trip_id || route === undefined || !row.service_id) continue;

    tripsById.set(row.trip_id, {
      id: row.trip_id,
      route,
      service: serviceFactory.get(row.service_id),
      headsign: row.trip_headsign || "",
      direction: Number(row.direction_id || 0),
    });
  }

  const stopTimesByTrip = new Map();

  for (const row of stopTimeRows) {
    const trip = tripsById.get(row.trip_id);
    const stop = stopIndexById.get(row.stop_id);
    if (!trip || stop === undefined) continue;

    let rows = stopTimesByTrip.get(row.trip_id);
    if (!rows) {
      rows = [];
      stopTimesByTrip.set(row.trip_id, rows);
    }

    rows.push({
      stop,
      arrival: parseTimeToSeconds(row.arrival_time),
      departure: parseTimeToSeconds(row.departure_time || row.arrival_time),
      sequence: Number(row.stop_sequence || rows.length + 1),
    });
  }

  const trips = [];

  for (const [tripId, trip] of tripsById) {
    const rows = stopTimesByTrip.get(tripId);
    if (!rows || rows.length < 2) continue;

    rows.sort((a, b) => a.sequence - b.sequence);
    trips.push({
      ...trip,
      stops: rows.map((row) => row.stop),
      arrivals: rows.map((row) => row.arrival),
      departures: rows.map((row) => row.departure),
      sequences: rows.map((row) => row.sequence),
    });
  }

  const servicesByDate = new Map();

  for (const row of calendarRows) {
    if (!row.service_id || !row.start_date || !row.end_date) continue;
    const serviceIndex = serviceFactory.get(row.service_id);
    const start = parseDateKey(row.start_date);
    const end = parseDateKey(row.end_date);
    const activeByDay = [
      row.sunday === "1",
      row.monday === "1",
      row.tuesday === "1",
      row.wednesday === "1",
      row.thursday === "1",
      row.friday === "1",
      row.saturday === "1",
    ];

    for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      if (activeByDay[date.getUTCDay()]) {
        addService(servicesByDate, formatDateKey(date), serviceIndex);
      }
    }
  }

  for (const row of calendarDateRows) {
    if (!row.service_id || !row.date) continue;
    const serviceIndex = serviceFactory.get(row.service_id);
    if (row.exception_type === "2") {
      removeService(servicesByDate, row.date, serviceIndex);
    } else {
      addService(servicesByDate, row.date, serviceIndex);
    }
  }

  const serviceDates = Array.from(servicesByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, services]) => [date, Array.from(services).sort((a, b) => a - b)]);

  const output = {
    generatedAt: new Date().toISOString(),
    source: STATIC_GTFS_URL,
    agency: agencyRows[0]?.agency_name || "Sofia Traffic",
    attribution: {
      label: "Sofia Traffic / Center for Urban Mobility",
      license: "CC BY 4.0",
      url: "https://www.sofia.bg/web/guest/transport-data",
    },
    serviceIds: serviceFactory.serviceIds,
    serviceDates,
    stops,
    routes,
    trips,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(output));

  const sizeMb = Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024;
  console.log(
    `Wrote ${OUT_FILE} with ${stops.length} stops, ${routes.length} routes, ${trips.length} trips (${sizeMb.toFixed(1)} MB)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
