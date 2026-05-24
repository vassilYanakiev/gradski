import type { Locale, Route, Stop, TransitData, TransitIndex } from "../types";

export function loadTransitData(): Promise<TransitData> {
  return fetch(`${import.meta.env.BASE_URL}data/gradski-data.json`).then((response) => {
    if (!response.ok) {
      throw new Error(`${response.url}: ${response.status}`);
    }
    return response.json();
  });
}

export function buildTransitIndex(data: TransitData): TransitIndex {
  return {
    stopById: new Map(data.stops.map((stop) => [stop.id, stop])),
    stopIndexById: new Map(data.stops.map((stop, index) => [stop.id, index])),
    routeById: new Map(data.routes.map((route) => [route.id, route])),
    routeIndexById: new Map(data.routes.map((route, index) => [route.id, index])),
    servicesByDate: new Map(data.serviceDates.map(([date, services]) => [date, new Set(services)])),
  };
}

export function stopName(stop: Stop | undefined, locale: Locale) {
  if (!stop) return "";
  return locale === "en" ? stop.names.en || stop.names.bg : stop.names.bg;
}

export function routeName(route: Route | undefined, locale: Locale) {
  if (!route) return "";
  const longName = locale === "en" ? route.names.en || route.names.bg : route.names.bg;
  return longName ? `${route.shortName} ${longName}` : route.shortName;
}

export function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("bg-BG")
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

export function searchStops(stops: Stop[], query: string, locale: Locale, limit = 8) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return [];

  const scored = stops
    .map((stop) => {
      const name = stopName(stop, locale);
      const bgName = stop.names.bg;
      const enName = stop.names.en || "";
      const haystack = normalizeSearch(`${name} ${bgName} ${enName} ${stop.code}`);
      const index = haystack.indexOf(normalizedQuery);
      if (index === -1) return null;
      return {
        stop,
        score: index + Math.max(0, haystack.length - normalizedQuery.length) / 1000,
      };
    })
    .filter((result): result is { stop: Stop; score: number } => result !== null)
    .sort((a, b) => a.score - b.score || stopName(a.stop, locale).localeCompare(stopName(b.stop, locale)));

  return scored.slice(0, limit).map((result) => result.stop);
}

export function routeSortValue(route: Route) {
  const numeric = Number(route.shortName.replace(/[^\d]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Number.MAX_SAFE_INTEGER;
}
