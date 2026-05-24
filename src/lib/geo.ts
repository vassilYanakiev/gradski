import type { Stop } from "../types";

export type Coordinates = {
  lat: number;
  lon: number;
};

export type NearbyStop = {
  stop: Stop;
  distanceMeters: number;
};

const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(a: Coordinates, b: Coordinates) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);

  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function findNearestStops(stops: Stop[], coordinates: Coordinates, limit = 5): NearbyStop[] {
  return stops
    .map((stop) => ({
      stop,
      distanceMeters: distanceMeters(coordinates, { lat: stop.lat, lon: stop.lon }),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

export function formatDistance(meters: number) {
  if (meters < 950) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}
