import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { epochSecondsToServiceSeconds } from "./time";

const TRIP_UPDATES_URL = "https://gtfs.sofiatraffic.bg/api/v1/trip-updates";
const VEHICLE_POSITIONS_URL = "https://gtfs.sofiatraffic.bg/api/v1/vehicle-positions";

export type RealtimeStopEvent = {
  stopId?: string;
  stopSequence?: number;
  arrival?: number;
  departure?: number;
  arrivalDelay?: number;
  departureDelay?: number;
  skipped?: boolean;
};

export type RealtimeTripUpdate = {
  tripId: string;
  routeId?: string;
  startDate?: string;
  canceled: boolean;
  stopEvents: RealtimeStopEvent[];
};

export type RealtimeSnapshot = {
  fetchedAt: string;
  tripUpdates: Map<string, RealtimeTripUpdate>;
  vehiclesByRoute: Map<string, number>;
};

type RawStopTimeUpdate = {
  stopId?: string;
  stopSequence?: unknown;
  arrival?: unknown;
  departure?: unknown;
  scheduleRelationship?: unknown;
};

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return undefined;
}

async function fetchFeed(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${response.url}: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
}

function isCanceled(value: unknown) {
  return value === 3 || value === "CANCELED";
}

function isSkipped(value: unknown) {
  return value === 1 || value === "SKIPPED";
}

function eventTime(event: unknown, serviceDateKey: string) {
  if (!event || typeof event !== "object") return undefined;
  const rawTime = toNumber("time" in event ? event.time : undefined);
  if (rawTime === undefined) return undefined;
  return epochSecondsToServiceSeconds(rawTime, serviceDateKey);
}

function eventDelay(event: unknown) {
  if (!event || typeof event !== "object") return undefined;
  return toNumber("delay" in event ? event.delay : undefined);
}

export async function fetchRealtimeSnapshot(serviceDateKey: string): Promise<RealtimeSnapshot> {
  const [tripFeed, vehicleFeed] = await Promise.all([fetchFeed(TRIP_UPDATES_URL), fetchFeed(VEHICLE_POSITIONS_URL)]);
  const tripUpdates = new Map<string, RealtimeTripUpdate>();
  const vehiclesByRoute = new Map<string, number>();

  for (const entity of tripFeed.entity || []) {
    const update = entity.tripUpdate;
    const trip = update?.trip;
    const tripId = trip?.tripId;
    if (!update || !tripId) continue;

    tripUpdates.set(tripId, {
      tripId,
      routeId: trip.routeId,
      startDate: trip.startDate,
      canceled: isCanceled(trip.scheduleRelationship),
      stopEvents: (update.stopTimeUpdate || []).map((stopUpdate: RawStopTimeUpdate) => ({
        stopId: stopUpdate.stopId,
        stopSequence: toNumber(stopUpdate.stopSequence),
        arrival: eventTime(stopUpdate.arrival, serviceDateKey),
        departure: eventTime(stopUpdate.departure, serviceDateKey),
        arrivalDelay: eventDelay(stopUpdate.arrival),
        departureDelay: eventDelay(stopUpdate.departure),
        skipped: isSkipped(stopUpdate.scheduleRelationship),
      })),
    });
  }

  for (const entity of vehicleFeed.entity || []) {
    const routeId = entity.vehicle?.trip?.routeId;
    if (!routeId) continue;
    vehiclesByRoute.set(routeId, (vehiclesByRoute.get(routeId) || 0) + 1);
  }

  return {
    fetchedAt: new Date().toISOString(),
    tripUpdates,
    vehiclesByRoute,
  };
}
