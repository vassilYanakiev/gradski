import type { Locale, SavedRoute } from "../types";

const ROUTES_KEY = "gradski.savedRoutes.v1";
const LOCALE_KEY = "gradski.locale.v1";

export function readSavedRoutes() {
  try {
    const raw = localStorage.getItem(ROUTES_KEY);
    return raw ? (JSON.parse(raw) as SavedRoute[]) : [];
  } catch {
    return [];
  }
}

export function writeSavedRoutes(routes: SavedRoute[]) {
  localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
}

export function readLocale(): Locale {
  return localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "bg";
}

export function writeLocale(locale: Locale) {
  localStorage.setItem(LOCALE_KEY, locale);
}
