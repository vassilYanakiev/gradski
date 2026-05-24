# градски

Mobile-first Sofia public transport trip planner built with React, Vite and GTFS.

## Features

- Bulgarian and English UI
- Stop search and current-location nearest stops
- Browser-local saved routes
- Direct line matching between selected stops
- Latest departure estimate for a desired arrival time
- GTFS-Realtime trip updates and vehicle positions for live estimates
- GitHub Pages deployment through GitHub Actions

## Data

Static schedules are fetched from:

`https://gtfs.sofiatraffic.bg/api/v1/static`

Live data is fetched from:

- `https://gtfs.sofiatraffic.bg/api/v1/trip-updates`
- `https://gtfs.sofiatraffic.bg/api/v1/vehicle-positions`

Data attribution: Sofia Traffic / Center for Urban Mobility, CC BY 4.0.

## Development

```bash
npm install
npm run data:build
npm run dev
```

## Deployment

The app deploys from `main` to GitHub Pages. The workflow also runs daily so the static GTFS timetable index is refreshed even when app code does not change.
