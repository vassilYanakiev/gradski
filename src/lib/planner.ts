import type { RealtimeSnapshot, RealtimeStopEvent } from "./realtime";
import { currentServiceSeconds, todayServiceKey } from "./time";
import { routeSortValue } from "./transit";
import type { Route, TransitData, TransitIndex, TransitTrip } from "../types";

export type DirectRouteOption = {
  routeIndex: number;
  tripCount: number;
  firstDeparture: number;
  lastArrival: number;
};

export type JourneyOption = {
  tripId: string;
  route: Route;
  headsign: string;
  scheduledDeparture: number;
  scheduledArrival: number;
  departure: number;
  arrival: number;
  delaySeconds: number;
  live: boolean;
  vehicleCount: number;
};

function findStopPair(trip: TransitTrip, startStopIndex: number, endStopIndex: number) {
  const startPosition = trip.stops.indexOf(startStopIndex);
  if (startPosition === -1) return null;

  const endPosition = trip.stops.indexOf(endStopIndex, startPosition + 1);
  if (endPosition === -1) return null;

  return { startPosition, endPosition };
}

function activeServices(index: TransitIndex, serviceDateKey: string) {
  return index.servicesByDate.get(serviceDateKey) || new Set<number>();
}

export function findDirectRoutes(
  data: TransitData,
  index: TransitIndex,
  startStopId: string,
  endStopId: string,
  serviceDateKey: string,
) {
  const startStopIndex = index.stopIndexById.get(startStopId);
  const endStopIndex = index.stopIndexById.get(endStopId);
  if (startStopIndex === undefined || endStopIndex === undefined || startStopIndex === endStopIndex) {
    return [];
  }

  const services = activeServices(index, serviceDateKey);
  const byRoute = new Map<number, DirectRouteOption>();

  for (const trip of data.trips) {
    if (!services.has(trip.service)) continue;
    const pair = findStopPair(trip, startStopIndex, endStopIndex);
    if (!pair) continue;

    const departure = trip.departures[pair.startPosition];
    const arrival = trip.arrivals[pair.endPosition];
    const current = byRoute.get(trip.route);

    if (!current) {
      byRoute.set(trip.route, {
        routeIndex: trip.route,
        tripCount: 1,
        firstDeparture: departure,
        lastArrival: arrival,
      });
    } else {
      current.tripCount += 1;
      current.firstDeparture = Math.min(current.firstDeparture, departure);
      current.lastArrival = Math.max(current.lastArrival, arrival);
    }
  }

  return Array.from(byRoute.values()).sort((a, b) => {
    const routeA = data.routes[a.routeIndex];
    const routeB = data.routes[b.routeIndex];
    return routeSortValue(routeA) - routeSortValue(routeB) || routeA.shortName.localeCompare(routeB.shortName);
  });
}

function stopUpdateFor(updateEvents: RealtimeStopEvent[], stopId: string, sequence: number) {
  return updateEvents.find((event) => event.stopId === stopId) || updateEvents.find((event) => event.stopSequence === sequence);
}

function liveTime(
  event: RealtimeStopEvent | undefined,
  scheduledTime: number,
  mode: "arrival" | "departure",
) {
  if (!event || event.skipped) {
    return { time: scheduledTime, live: false, skipped: Boolean(event?.skipped) };
  }

  const exact = mode === "arrival" ? event.arrival : event.departure;
  const delay = mode === "arrival" ? event.arrivalDelay : event.departureDelay;

  if (exact !== undefined) {
    return { time: exact, live: true, skipped: false };
  }

  if (delay !== undefined) {
    return { time: scheduledTime + delay, live: true, skipped: false };
  }

  return { time: scheduledTime, live: false, skipped: false };
}

export function planLatestDepartures(
  data: TransitData,
  index: TransitIndex,
  params: {
    startStopId: string;
    endStopId: string;
    serviceDateKey: string;
    desiredArrivalSeconds: number;
    selectedRouteIds: string[];
    realtime?: RealtimeSnapshot;
  },
) {
  const startStopIndex = index.stopIndexById.get(params.startStopId);
  const endStopIndex = index.stopIndexById.get(params.endStopId);
  if (startStopIndex === undefined || endStopIndex === undefined) {
    return [];
  }

  const services = activeServices(index, params.serviceDateKey);
  const selectedRoutes = new Set(params.selectedRouteIds);
  const now = params.serviceDateKey === todayServiceKey() ? currentServiceSeconds() - 60 : -Infinity;
  const journeys: JourneyOption[] = [];

  for (const trip of data.trips) {
    if (!services.has(trip.service)) continue;

    const route = data.routes[trip.route];
    if (!route || (selectedRoutes.size > 0 && !selectedRoutes.has(route.id))) continue;

    const pair = findStopPair(trip, startStopIndex, endStopIndex);
    if (!pair) continue;

    const startStop = data.stops[startStopIndex];
    const endStop = data.stops[endStopIndex];
    const scheduledDeparture = trip.departures[pair.startPosition];
    const scheduledArrival = trip.arrivals[pair.endPosition];
    const update = params.realtime?.tripUpdates.get(trip.id);

    if (update?.canceled) continue;

    const startEvent = update
      ? stopUpdateFor(update.stopEvents, startStop.id, trip.sequences[pair.startPosition])
      : undefined;
    const endEvent = update ? stopUpdateFor(update.stopEvents, endStop.id, trip.sequences[pair.endPosition]) : undefined;
    const departure = liveTime(startEvent, scheduledDeparture, "departure");
    const arrival = liveTime(endEvent, scheduledArrival, "arrival");

    if (departure.skipped || arrival.skipped) continue;
    if (arrival.time > params.desiredArrivalSeconds) continue;
    if (departure.time < now) continue;

    journeys.push({
      tripId: trip.id,
      route,
      headsign: trip.headsign,
      scheduledDeparture,
      scheduledArrival,
      departure: departure.time,
      arrival: arrival.time,
      delaySeconds: arrival.time - scheduledArrival,
      live: departure.live || arrival.live,
      vehicleCount: params.realtime?.vehiclesByRoute.get(route.id) || 0,
    });
  }

  return journeys.sort((a, b) => b.departure - a.departure).slice(0, 5);
}
