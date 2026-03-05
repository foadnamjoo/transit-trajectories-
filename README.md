# Transit Trajectories

Interactive transit analytics dashboard with route trajectories on a live map, fleet metrics, and time-series visualizations. Built with D3.js and Leaflet (OpenStreetMap).

## What is this?

A web-based visualization tool for exploring transit route performance in Salt Lake City. It combines:

- **Overview** — Histogram, line chart, time series, and scatterplot of ridership and on-time performance across 6 routes (A–F)
- **Map & routes** — Route trajectories on an interactive OpenStreetMap, with start (S) and end (E) markers (e.g., Route A: Airport → University of Utah)
- **Fleet & cost** — Fuel consumption over time, total cost by route, and vehicle type usage (Hybrid, Diesel, CNG)

## How to use

1. **Run locally**
   ```bash
   python3 -m http.server 8080
   ```
   Then open [http://localhost:8080](http://localhost:8080)

2. **Navigate**
   - Use the **View** dropdown: Performance overview, Routes & map, Fleet & emissions
   - **Route** — Select Route A through F
   - **Metric** — Ridership or On-time %

3. **Overview**
   - Charts respond to route and metric selection
   - Click legend items (day type) to filter by Weekday / Weekend / Holiday

4. **Map**
   - Routes show trajectories between SLC landmarks (airport, university, downtown, etc.)
   - Use checkboxes to show or hide routes
   - Click a route to highlight it; hover for details

5. **Fleet & emissions**
   - Emissions-over-time, cost, and vehicle mix charts update when you change the selected route

## Tech stack

- **D3.js v7** — Charts and visualizations
- **Leaflet** — Interactive map with OpenStreetMap tiles
- **Plain HTML/CSS/JS** — No build step; open in a browser after serving

## Project structure

```
├── index.html          # Main app
├── script.js           # D3 charts, map, data logic
├── style.css           # Styles
├── data/
│   ├── route_a.csv … route_f.csv   # Route data (ridership, on-time %, vehicle type, fuel, cost, CO2)
│   └── route_trajectories.json     # Lat/lng waypoints for each route
└── scripts/
    └── enrich-data.js  # Adds synthetic vehicle/fuel/cost columns; run: node scripts/enrich-data.js
```

## Author

**Foad Namjoo** · [Personal Webpage](https://users.cs.utah.edu/~foad27/)
