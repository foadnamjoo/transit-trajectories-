#!/usr/bin/env node
/**
 * Enriches route CSVs with synthetic columns: vehicle_type, fuel_liters, cost_usd.
 * Generates route_e.csv and route_f.csv with same schema.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

const VEHICLE_TYPES = ["Hybrid", "Diesel", "CNG"];
// Route-specific bias so vehicle usage varies (not 40/40/40)
const ROUTE_BIAS = {
  route_a: [0.55, 0.28, 0.17],
  route_b: [0.25, 0.55, 0.20],
  route_c: [0.30, 0.25, 0.45],
  route_d: [0.40, 0.35, 0.25],
  route_e: [0.20, 0.50, 0.30],
  route_f: [0.35, 0.20, 0.45],
};
function vehicleForDay(dayIndex, routeName) {
  const bias = ROUTE_BIAS[routeName] || [0.33, 0.33, 0.34];
  const r = (dayIndex * 17 + routeName.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 100 / 100;
  if (r < bias[0]) return "Hybrid";
  if (r < bias[0] + bias[1]) return "Diesel";
  return "CNG";
}

function seed(routeId, dayIndex) {
  const s = routeId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return (s * 31 + dayIndex * 17) % 1000 / 1000;
}

function enrichRow(d, dayIndex, routeKey) {
  const ridership = +d.ridership;
  const r = seed(routeKey, dayIndex);
  const fuelLiters = Math.round((35 + ridership * 0.055 + r * 8) * 10) / 10;
  const costUsd = Math.round((65 + fuelLiters * 1.4 + r * 12) * 100) / 100;
  return {
    ...d,
    vehicle_type: vehicleForDay(dayIndex, routeKey.replace(/^Route\s*/i, "route_").toLowerCase().replace(/\s/g, "_")),
    fuel_liters: fuelLiters,
    cost_usd: costUsd,
  };
}

function toCsvRow(obj) {
  return [
    obj.date,
    obj.group,
    obj.ridership,
    obj.on_time_pct,
    obj.day_type,
    obj.vehicle_type || "Hybrid",
    (obj.fuel_liters ?? 0).toFixed(1),
    (obj.cost_usd ?? 0).toFixed(2),
  ].join(",");
}

const header =
  "date,group,ridership,on_time_pct,day_type,vehicle_type,fuel_liters,cost_usd";

// Enrich existing route_a .. route_d
for (const name of ["route_a", "route_b", "route_c", "route_d"]) {
  const file = path.join(DATA_DIR, `${name}.csv`);
  const text = fs.readFileSync(file, "utf8");
  const lines = text.trim().split("\n");
  const colHeader = lines[0];
  const dataLines = lines.slice(1);
  const routeLabel = name.replace("route_", "").toUpperCase();

  const rows = [];
  dataLines.forEach((line, i) => {
    const parts = line.split(",");
    const d = {
      date: parts[0],
      group: parts[1],
      ridership: parts[2],
      on_time_pct: parts[3],
      day_type: parts[4],
    };
    const enriched = enrichRow(d, i, name);
    rows.push(toCsvRow(enriched));
  });

  const out = [header, ...rows].join("\n") + "\n";
  fs.writeFileSync(file, out);
  console.log(`Wrote ${name}.csv (${rows.length} rows)`);
}

// Generate route_e and route_f (same dates as route_a, synthetic ridership/on_time)
const routeA = fs.readFileSync(path.join(DATA_DIR, "route_a.csv"), "utf8");
const aLines = routeA.trim().split("\n").slice(1);

function genRoute(routeName, baseRidership, ridershipSpread, baseOnTime, onTimeSpread) {
  const rows = [];
  aLines.forEach((line, i) => {
    const parts = line.split(",");
    const date = parts[0];
    const dayType = parts[4];
    const r1 = seed(routeName + "r", i);
    const r2 = seed(routeName + "t", i);
    const ridership = Math.round(baseRidership + (r1 - 0.5) * ridershipSpread);
    const onTime = Math.min(99, Math.max(75, baseOnTime + (r2 - 0.5) * onTimeSpread));
    const d = {
      date,
      group: routeName,
      ridership: String(ridership),
      on_time_pct: String(onTime),
      day_type: dayType,
    };
    const enriched = enrichRow(d, i, routeName.replace("Route ", "route_"));
    rows.push(toCsvRow(enriched));
  });
  return [header, ...rows].join("\n") + "\n";
}

fs.writeFileSync(
  path.join(DATA_DIR, "route_e.csv"),
  genRoute("Route E", 1100, 500, 89, 10)
);
console.log("Wrote route_e.csv");

fs.writeFileSync(
  path.join(DATA_DIR, "route_f.csv"),
  genRoute("Route F", 720, 400, 91, 8)
);
console.log("Wrote route_f.csv");
