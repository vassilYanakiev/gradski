import {
  CalendarClock,
  Check,
  Clock3,
  Languages,
  RefreshCw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { StopPicker } from "./components/StopPicker";
import { getCopy } from "./lib/i18n";
import { findDirectRoutes, planLatestDepartures, type JourneyOption } from "./lib/planner";
import { fetchRealtimeSnapshot, type RealtimeSnapshot } from "./lib/realtime";
import { readLocale, readSavedRoutes, writeLocale, writeSavedRoutes } from "./lib/storage";
import {
  buildTransitIndex,
  loadTransitData,
  routeName,
  stopName,
} from "./lib/transit";
import {
  dateInputToServiceKey,
  defaultArrivalTime,
  formatDataDate,
  formatDelay,
  formatServiceTime,
  timeInputToSeconds,
  toDateInputValue,
  todayServiceKey,
} from "./lib/time";
import type { Locale, SavedRoute, TransitData } from "./types";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
}

function delayLabel(journey: JourneyOption, t: Record<string, string>) {
  if (Math.abs(journey.delaySeconds) < 30) return t.onTime;
  if (journey.delaySeconds > 0) return `${formatDelay(journey.delaySeconds)} ${t.delay}`;
  return `${formatDelay(journey.delaySeconds)} ${t.early}`;
}

function App() {
  const [locale, setLocale] = useState<Locale>(() => readLocale());
  const [data, setData] = useState<TransitData | null>(null);
  const [dataError, setDataError] = useState("");
  const [startStopId, setStartStopId] = useState("");
  const [endStopId, setEndStopId] = useState("");
  const [date, setDate] = useState(() => toDateInputValue());
  const [arrivalTime, setArrivalTime] = useState(() => defaultArrivalTime());
  const [routeLabel, setRouteLabel] = useState("");
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => readSavedRoutes());
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);
  const [journeys, setJourneys] = useState<JourneyOption[]>([]);
  const [realtime, setRealtime] = useState<RealtimeSnapshot | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [liveError, setLiveError] = useState("");

  const t = getCopy(locale);
  const serviceDateKey = dateInputToServiceKey(date);
  const index = useMemo(() => (data ? buildTransitIndex(data) : null), [data]);
  const startStop = startStopId ? index?.stopById.get(startStopId) : undefined;
  const endStop = endStopId ? index?.stopById.get(endStopId) : undefined;

  useEffect(() => {
    loadTransitData()
      .then(setData)
      .catch((error: Error) => setDataError(error.message));
  }, []);

  useEffect(() => {
    writeLocale(locale);
  }, [locale]);

  useEffect(() => {
    writeSavedRoutes(savedRoutes);
  }, [savedRoutes]);

  const routeOptions = useMemo(() => {
    if (!data || !index || !startStopId || !endStopId) return [];
    return findDirectRoutes(data, index, startStopId, endStopId, serviceDateKey);
  }, [data, endStopId, index, serviceDateKey, startStopId]);

  const routeOptionKey = routeOptions.map((option) => data?.routes[option.routeIndex].id).join("|");

  useEffect(() => {
    if (!data) return;
    setSelectedRouteIds(routeOptions.map((option) => data.routes[option.routeIndex].id));
    setJourneys([]);
    setHasCalculated(false);
  }, [data, routeOptionKey, routeOptions]);

  function setAppLocale(nextLocale: Locale) {
    setLocale(nextLocale);
  }

  function saveCurrentRoute() {
    if (!startStop || !endStop) return;
    const name = routeLabel.trim() || `${stopName(startStop, locale)} -> ${stopName(endStop, locale)}`;
    const savedRoute: SavedRoute = {
      id: newId(),
      name,
      startStopId: startStop.id,
      endStopId: endStop.id,
      createdAt: new Date().toISOString(),
    };

    setSavedRoutes((routes) => [
      savedRoute,
      ...routes.filter((route) => route.startStopId !== startStop.id || route.endStopId !== endStop.id),
    ]);
    setRouteLabel("");
  }

  function selectSavedRoute(route: SavedRoute) {
    setStartStopId(route.startStopId);
    setEndStopId(route.endStopId);
  }

  function removeSavedRoute(routeId: string) {
    setSavedRoutes((routes) => routes.filter((route) => route.id !== routeId));
  }

  function toggleRoute(routeId: string) {
    setSelectedRouteIds((routeIds) =>
      routeIds.includes(routeId) ? routeIds.filter((id) => id !== routeId) : [...routeIds, routeId],
    );
  }

  function selectAllRoutes() {
    if (!data) return;
    setSelectedRouteIds(routeOptions.map((option) => data.routes[option.routeIndex].id));
  }

  async function calculate() {
    if (!data || !index || !startStopId || !endStopId) return;

    setCalculating(true);
    setHasCalculated(true);
    setLiveError("");

    let snapshot: RealtimeSnapshot | undefined;
    try {
      if (serviceDateKey === todayServiceKey()) {
        snapshot = await fetchRealtimeSnapshot(serviceDateKey);
        setRealtime(snapshot);
      } else {
        setRealtime(null);
      }
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : String(error));
      setRealtime(null);
    }

    setJourneys(
      planLatestDepartures(data, index, {
        startStopId,
        endStopId,
        serviceDateKey,
        desiredArrivalSeconds: timeInputToSeconds(arrivalTime),
        selectedRouteIds,
        realtime: snapshot,
      }),
    );
    setCalculating(false);
  }

  if (dataError) {
    return (
      <main className="app-shell compact-state">
        <h1>{t.appName}</h1>
        <p>{t.dataError}</p>
        <code>{dataError}</code>
      </main>
    );
  }

  if (!data || !index) {
    return (
      <main className="app-shell compact-state">
        <h1>{t.appName}</h1>
        <p>{t.loading}</p>
      </main>
    );
  }

  const primaryJourney = journeys[0];
  const liveApplies = serviceDateKey === todayServiceKey();

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p>{t.direct}</p>
          <h1>{t.appName}</h1>
        </div>

        <div className="header-actions">
          <div className="language-toggle" aria-label="Language">
            <Languages size={16} aria-hidden="true" />
            <button className={locale === "bg" ? "active" : ""} type="button" onClick={() => setAppLocale("bg")}>
              BG
            </button>
            <button className={locale === "en" ? "active" : ""} type="button" onClick={() => setAppLocale("en")}>
              EN
            </button>
          </div>
          <span className="data-pill">
            {t.generated}: {formatDataDate(data.generatedAt)}
          </span>
        </div>
      </header>

      <section className="planner-grid" aria-label={t.route}>
        <div className="panel route-panel">
          <div className="panel-title">
            <CalendarClock size={20} aria-hidden="true" />
            <h2>{t.route}</h2>
          </div>

          <div className="stop-grid">
            <StopPicker
              label={t.start}
              locale={locale}
              stops={data.stops}
              selectedStopId={startStopId}
              onChange={setStartStopId}
              useLocationLabel={t.useLocation}
              nearbyLabel={t.nearby}
              locationErrorLabel={t.locationDenied}
            />
            <StopPicker
              label={t.destination}
              locale={locale}
              stops={data.stops}
              selectedStopId={endStopId}
              onChange={setEndStopId}
              useLocationLabel={t.useLocation}
              nearbyLabel={t.nearby}
              locationErrorLabel={t.locationDenied}
            />
          </div>

          <div className="save-row">
            <label>
              <span>{t.routeName}</span>
              <input value={routeLabel} onChange={(event) => setRouteLabel(event.target.value)} />
            </label>
            <button className="primary-button" type="button" onClick={saveCurrentRoute} disabled={!startStop || !endStop}>
              <Save size={18} aria-hidden="true" />
              <span>{t.saveRoute}</span>
            </button>
          </div>
        </div>

        <aside className="panel saved-panel">
          <div className="panel-title">
            <Check size={20} aria-hidden="true" />
            <h2>{t.savedRoutes}</h2>
          </div>

          <div className="saved-list">
            {savedRoutes.length === 0 && <p className="muted">{t.noSavedRoutes}</p>}
            {savedRoutes.map((route) => (
              <div className="saved-route" key={route.id}>
                <button type="button" onClick={() => selectSavedRoute(route)}>
                  <strong>{route.name}</strong>
                  <span>
                    {stopName(index.stopById.get(route.startStopId), locale)} {"->"}{" "}
                    {stopName(index.stopById.get(route.endStopId), locale)}
                  </span>
                </button>
                <button className="icon-button" type="button" onClick={() => removeSavedRoute(route.id)} aria-label="Delete">
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="panel trip-panel" aria-label={t.when}>
        <div className="time-grid">
          <label>
            <span>{t.date}</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span>{t.arrivalTime}</span>
            <input type="time" value={arrivalTime} onChange={(event) => setArrivalTime(event.target.value)} />
          </label>
          <button className="primary-button calculate-button" type="button" onClick={calculate} disabled={calculating || !startStop || !endStop}>
            {calculating ? <RefreshCw className="spin" size={18} aria-hidden="true" /> : <Clock3 size={18} aria-hidden="true" />}
            <span>{t.calculate}</span>
          </button>
        </div>

        <div className="line-section">
          <div className="line-heading">
            <h2>{t.lines}</h2>
            <button className="ghost-button" type="button" onClick={selectAllRoutes} disabled={routeOptions.length === 0}>
              {t.all}
            </button>
          </div>

          {!startStop || !endStop ? (
            <p className="muted">{t.selectStops}</p>
          ) : routeOptions.length === 0 ? (
            <p className="muted">{t.noLines}</p>
          ) : (
            <div className="line-list">
              {routeOptions.map((option) => {
                const route = data.routes[option.routeIndex];
                const checked = selectedRouteIds.includes(route.id);
                const vehicleCount = realtime?.vehiclesByRoute.get(route.id) || 0;
                return (
                  <label className={checked ? "line-chip selected" : "line-chip"} key={route.id}>
                    <input type="checkbox" checked={checked} onChange={() => toggleRoute(route.id)} />
                    <span className="route-badge">{route.shortName}</span>
                    <span>{routeName(route, locale)}</span>
                    {vehicleCount > 0 && <small>{vehicleCount} {t.vehicles}</small>}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="result-area" aria-label={t.result}>
        <div className="status-row">
          <span className={liveApplies && !liveError ? "live-status on" : "live-status"}>
            {liveApplies && !liveError ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
            {liveApplies && !liveError ? t.liveReady : t.scheduledOnly}
          </span>
          {!liveApplies && <span className="muted">{t.todayLiveOnly}</span>}
          {liveError && <span className="inline-error">{t.scheduledOnly}</span>}
        </div>

        {primaryJourney ? (
          <div className="result-card">
            <div>
              <span className="result-label">{t.leaveAt}</span>
              <strong>{formatServiceTime(primaryJourney.departure)}</strong>
            </div>
            <div className="journey-meta">
              <span className="route-badge large">{primaryJourney.route.shortName}</span>
              <span>{primaryJourney.headsign || routeName(primaryJourney.route, locale)}</span>
            </div>
            <div className="arrival-row">
              <span>
                {t.arriveAt}: {formatServiceTime(primaryJourney.arrival)}
              </span>
              <span>{delayLabel(primaryJourney, t)}</span>
              <span>{primaryJourney.live ? t.liveReady : t.scheduledOnly}</span>
            </div>
          </div>
        ) : hasCalculated ? (
          <div className="empty-result">{t.noTrip}</div>
        ) : null}

        {journeys.length > 1 && (
          <div className="alternative-list">
            {journeys.slice(1).map((journey) => (
              <div className="alternative-row" key={journey.tripId}>
                <span className="route-badge">{journey.route.shortName}</span>
                <span>{formatServiceTime(journey.departure)}</span>
                <span>{formatServiceTime(journey.arrival)}</span>
                <small>{delayLabel(journey, t)}</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer>
        {t.source}:{" "}
        <a href={data.attribution.url} target="_blank" rel="noreferrer">
          {data.attribution.label}
        </a>{" "}
        ({data.attribution.license})
      </footer>
    </main>
  );
}

export default App;
