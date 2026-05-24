export type Locale = "bg" | "en";

export type Stop = {
  id: string;
  code: string;
  names: {
    bg: string;
    en?: string;
  };
  lat: number;
  lon: number;
  parentId: string;
};

export type Route = {
  id: string;
  shortName: string;
  names: {
    bg: string;
    en?: string;
  };
  type: number;
  typeName: string;
  color: string;
  textColor: string;
};

export type TransitTrip = {
  id: string;
  route: number;
  service: number;
  headsign: string;
  direction: number;
  stops: number[];
  arrivals: number[];
  departures: number[];
  sequences: number[];
};

export type TransitData = {
  generatedAt: string;
  source: string;
  agency: string;
  attribution: {
    label: string;
    license: string;
    url: string;
  };
  serviceIds: string[];
  serviceDates: [string, number[]][];
  stops: Stop[];
  routes: Route[];
  trips: TransitTrip[];
};

export type TransitIndex = {
  stopById: Map<string, Stop>;
  stopIndexById: Map<string, number>;
  routeById: Map<string, Route>;
  routeIndexById: Map<string, number>;
  servicesByDate: Map<string, Set<number>>;
};

export type SavedRoute = {
  id: string;
  name: string;
  startStopId: string;
  endStopId: string;
  createdAt: string;
};
