import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { findNearestStops, formatDistance, type NearbyStop } from "../lib/geo";
import { searchStops, stopName } from "../lib/transit";
import type { Locale, Stop } from "../types";

type StopPickerProps = {
  label: string;
  locale: Locale;
  stops: Stop[];
  selectedStopId: string;
  onChange: (stopId: string) => void;
  useLocationLabel: string;
  nearbyLabel: string;
  locationErrorLabel: string;
};

export function StopPicker({
  label,
  locale,
  stops,
  selectedStopId,
  onChange,
  useLocationLabel,
  nearbyLabel,
  locationErrorLabel,
}: StopPickerProps) {
  const selectedStop = stops.find((stop) => stop.id === selectedStopId);
  const [query, setQuery] = useState("");
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [locationError, setLocationError] = useState("");

  useEffect(() => {
    if (selectedStop) {
      setQuery(stopName(selectedStop, locale));
    }
  }, [locale, selectedStop]);

  const results = useMemo(() => {
    if (selectedStop && query === stopName(selectedStop, locale)) return [];
    return searchStops(stops, query, locale);
  }, [locale, query, selectedStop, stops]);

  function chooseStop(stop: Stop) {
    onChange(stop.id);
    setQuery(stopName(stop, locale));
  }

  function useCurrentLocation() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError(locationErrorLabel);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearest = findNearestStops(
          stops,
          {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          },
          5,
        );
        setNearbyStops(nearest);
        if (nearest[0]) {
          chooseStop(nearest[0].stop);
        }
      },
      () => setLocationError(locationErrorLabel),
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 30000 },
    );
  }

  return (
    <div className="stop-picker">
      <div className="field-heading">
        <MapPin size={18} aria-hidden="true" />
        <span>{label}</span>
      </div>

      <div className="search-row">
        <label className="search-input">
          <Search size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={label}
            autoComplete="off"
          />
        </label>
        <button className="icon-button" type="button" onClick={() => setQuery("")} aria-label="Clear">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {results.length > 0 && (
        <div className="result-list">
          {results.map((stop) => (
            <button key={stop.id} type="button" className="result-option" onClick={() => chooseStop(stop)}>
              <span>{stopName(stop, locale)}</span>
              {stop.code && <small>{stop.code}</small>}
            </button>
          ))}
        </div>
      )}

      <button className="ghost-button location-button" type="button" onClick={useCurrentLocation}>
        <LocateFixed size={18} aria-hidden="true" />
        <span>{useLocationLabel}</span>
      </button>

      {locationError && <p className="inline-error">{locationError}</p>}

      {nearbyStops.length > 0 && (
        <div className="nearby-list" aria-label={nearbyLabel}>
          <span>{nearbyLabel}</span>
          {nearbyStops.map(({ stop, distanceMeters }) => (
            <button key={stop.id} type="button" onClick={() => chooseStop(stop)}>
              {stopName(stop, locale)}
              <small>{formatDistance(distanceMeters)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
