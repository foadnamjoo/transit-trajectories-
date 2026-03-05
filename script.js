// ===== Hand-tuned HW2 (root) script.js =====

// --- Constants & helpers ---
const CHART_WIDTH = 560;
const CHART_HEIGHT = 280;
const FLEET_CHART_WIDTH = 420;
const FLEET_CHART_HEIGHT = 260;
const MARGIN = { left: 58, bottom: 52, top: 24, right: 20 };
const ANIMATION_DURATION = 420;

const METRIC_MAP = { attribute1: "ridership", attribute2: "on_time_pct" };
const CATEGORY_FIELD = "day_type";
const DATE_FIELD = "date";
const parseDate = d3.timeParse("%Y-%m-%d");

const metricNames = {
  ridership: "Ridership (passengers/day)",
  on_time_pct: "On-time performance (%)",
};

// Professional palette: colorblind-friendly, print-safe (Paul Tol–inspired)
const dayTypeColor = d3.scaleOrdinal()
  .domain(["Weekday", "Weekend", "Holiday"])
  .range(["#1170aa", "#c55a11", "#2e7d32"]);

const HISTOGRAM_FILL = "#0d9488";
const LINE_STROKE = "#334155";
const STACKED_KEYS = ["ridership", "on_time_pct"];
const STACKED_LABELS = { ridership: "Ridership", on_time_pct: "On-time %" };
const stackedAreaColors = ["#0d9488", "#64748b"];
const TIME_SERIES_COLORS = ["#1170aa", "#c55a11"];

// Formatters
const fmtInt   = d3.format(",");
const fmtPct   = d3.format(".0f");
const monthFmt = d3.timeFormat("%b");
const fullDate = d3.timeFormat("%b %d, %Y");

function yTickFormatFor(metric) {
  return metric === "on_time_pct" ? (d) => fmtPct(d) + "%" : (d) => fmtInt(d);
}
function xTickFormatFor(metric) {
  return metric === "on_time_pct" ? (d) => fmtPct(d) + "%" : (d) => fmtInt(d);
}

// --- Tooltip (auto-create if missing) ---
const tip = (function () {
  let t = d3.select("#tooltip");
  if (t.empty()) {
    t = d3.select("body").append("div")
      .attr("id", "tooltip")
      .attr("class", "vis-tooltip")
      .style("opacity", 0);
  }
  return t;
})();
function showTip(html, evt) {
  const [x, y] = d3.pointer(evt, document.body);
  tip.style("opacity", 1)
     .html(html)
     .style("left", (x + 12) + "px")
     .style("top",  (y + 12) + "px");
}
function hideTip() { tip.style("opacity", 0); }

// --- State & Refs ---
let STATE = { rows: [], metricKey: METRIC_MAP.attribute1, allRoutes: null, trajectories: null };
const REFS = { hist: null, line: null, timeSeries: null, scat: null, fuel: null, costByRoute: null, vehicleBreakdown: null };
const ROUTE_FILES = ["route_a.csv", "route_b.csv", "route_c.csv", "route_d.csv", "route_e.csv", "route_f.csv"];
const ROUTE_LABELS = { "route_a.csv": "Route A", "route_b.csv": "Route B", "route_c.csv": "Route C", "route_d.csv": "Route D", "route_e.csv": "Route E", "route_f.csv": "Route F" };
const ROUTE_DESCRIPTIONS = {
  "Route A": "Airport → University of Utah",
  "Route B": "Downtown → University of Utah",
  "Route C": "Airport → Downtown",
  "Route D": "University of Utah → Sugar House",
  "Route E": "Downtown → Sugar House",
  "Route F": "Airport → Capitol Hill"
};
const routeColor = d3.scaleOrdinal().domain(ROUTE_FILES.map(f => ROUTE_LABELS[f])).range(["#1170aa", "#c55a11", "#2e7d32", "#7c2d8a", "#0d9488", "#64748b"]);
const vehicleColor = d3.scaleOrdinal().domain(["Hybrid", "Diesel", "CNG"]).range(["#0d9488", "#64748b", "#c55a11"]);

// --- UI badges for current selections ---
function updateBadges(){
  const sel = d3.select('#dataset').property('value');
  const dsText = ROUTE_LABELS[sel] || d3.select('#dataset').select('option:checked').text();
  const metricUi = d3.select('#metric').property('value');
  const mk = METRIC_MAP[metricUi] || METRIC_MAP.attribute1;
  d3.select('#datasetLabel').text(dsText || '—');
  d3.select('#metricLabel').text(metricNames[mk] || mk);
}

// --- Entry point ---
document.addEventListener("DOMContentLoaded", setup);

function setup () {
  STATE.currentPanel = "overview";

  d3.select("#dataset").on("change", () => { changeData(); updateBadges(); });
  d3.select("#metric").on("change", () => {
    const ui = d3.select("#metric").property("value");
    STATE.metricKey = METRIC_MAP[ui] || METRIC_MAP.attribute1;
    updateBadges();
    update(STATE.rows);
  });

  // Section dropdown
  d3.select("#section-select").on("change", function() {
    switchPanel(this.value);
  });

  // Scaffolds for overview charts
  REFS.hist  = makeScaffold("#Histogram-div");
  REFS.line  = makeScaffold("#Linechart-div");
  REFS.timeSeries = makeScaffold("#TimeSeries-div");
  REFS.scat  = makeScaffold("#Scatterplot-div");

  updateBadges();
  changeData();
}

function switchPanel(name) {
  STATE.currentPanel = name;
  d3.select("#section-select").property("value", name);
  d3.selectAll(".panel").classed("active", false);
  const panelId = name === "overview" ? "panel-overview" : name === "map" ? "panel-map" : "panel-fleet";
  d3.select("#" + panelId).classed("active", true);
  if (name === "map") initMapPanel();
  if (name === "fleet") initFleetPanel();
}

function loadAllRoutes() {
  if (STATE.allRoutes) return Promise.resolve(STATE.allRoutes);
  return Promise.all(ROUTE_FILES.map(f => d3.csv(`data/${f}`))).then(rawArrays => {
    const out = {};
    ROUTE_FILES.forEach((f, i) => {
      const raw = rawArrays[i];
      const rows = raw.map(d => {
        const r = {
          date: parseDate(d[DATE_FIELD]),
          group: d.group,
          ridership: +d.ridership,
          on_time_pct: +d.on_time_pct,
          day_type: d[CATEGORY_FIELD],
        };
        if (d.vehicle_type != null && d.vehicle_type !== "") r.vehicle_type = d.vehicle_type;
        if (d.fuel_liters != null && d.fuel_liters !== "") r.fuel_liters = +d.fuel_liters;
        if (d.cost_usd != null && d.cost_usd !== "") r.cost_usd = +d.cost_usd;
        return r;
      }).filter(d => d.date && isFinite(d.ridership) && isFinite(d.on_time_pct));
      out[ROUTE_LABELS[f]] = rows;
    });
    STATE.allRoutes = out;
    return out;
  });
}

function initMapPanel() {
  const container = d3.select("#city-map");
  if (STATE.leafletMap) return;
  if (!STATE.trajectories) {
    container.html("<p class='map-loading'>Loading routes…</p>");
    d3.json("data/route_trajectories.json").then(traj => {
      STATE.trajectories = traj;
      container.html("");
      drawLeafletMap();
      renderMapLegend();
    }).catch(() => container.html("<p class='map-loading'>Could not load route data.</p>"));
  } else {
    container.html("");
    drawLeafletMap();
    renderMapLegend();
  }
}

function drawLeafletMap() {
  if (typeof L === "undefined") {
    d3.select("#city-map").html("<p class='map-loading'>Leaflet not loaded.</p>");
    return;
  }
  const container = document.getElementById("city-map");
  if (!container) return;

  const map = L.map(container, { zoomControl: true }).setView([40.765, -111.868], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
    maxZoom: 19
  }).addTo(map);

  const routeLayers = {};
  const routeMarkers = {};
  const allBounds = [];

  Object.keys(STATE.trajectories || {}).forEach(routeName => {
    const coords = STATE.trajectories[routeName].map(p => [Number(p[0]), Number(p[1])]);
    if (!coords.length) return;

    const polyline = L.polyline(coords, {
      color: routeColor(routeName),
      weight: 8,
      opacity: 0.95
    }).addTo(map);

    polyline.on("mouseover", function() {
      this.setStyle({ weight: 12, opacity: 1 });
    });
    polyline.on("mouseout", function() {
      if (STATE.highlightedRoute !== routeName)
        this.setStyle({ weight: 8, opacity: 0.95 });
    });
    polyline.on("click", function() {
      STATE.highlightedRoute = STATE.highlightedRoute === routeName ? null : routeName;
      Object.keys(routeLayers).forEach(r => {
        routeLayers[r].setStyle({ weight: 8, opacity: STATE.highlightedRoute === r ? 1 : 0.4 });
      });
      if (STATE.highlightedRoute) routeLayers[routeName].bringToFront();
    });
    const desc = ROUTE_DESCRIPTIONS[routeName] || routeName;
    polyline.bindTooltip(`${routeName}: ${desc}`, { permanent: false, direction: "top", className: "route-tooltip" });

    const start = coords[0];
    const end = coords[coords.length - 1];
    const startMarker = L.marker(start, {
      icon: L.divIcon({
        html: `<span style="background:#16a34a;color:#fff;padding:2px 6px;border-radius:50%;font-weight:700;font-size:10px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">S</span>`,
        className: "route-label-marker",
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      })
    }).addTo(map).bindTooltip(`${routeName} START — ${desc}`, { permanent: false });
    const endMarker = L.marker(end, {
      icon: L.divIcon({
        html: `<span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:50%;font-weight:700;font-size:10px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">E</span>`,
        className: "route-label-marker",
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      })
    }).addTo(map).bindTooltip(`${routeName} END`, { permanent: false });

    routeLayers[routeName] = polyline;
    routeMarkers[routeName] = { start: startMarker, end: endMarker };
    allBounds.push(L.latLngBounds(coords));
  });

  if (allBounds.length) {
    const combined = allBounds[0];
    allBounds.forEach(b => combined.extend(b));
    map.fitBounds(combined.pad(0.15));
  }

  setTimeout(() => map.invalidateSize(), 100);
  STATE.leafletMap = map;
  STATE.routeLayers = routeLayers;
  STATE.routeMarkers = routeMarkers;
}

function renderMapLegend() {
  const wrap = d3.select("#map-legend").html("");
  Object.keys(STATE.trajectories || {}).forEach(routeName => {
    const label = wrap.append("label");
    label.append("input").attr("type", "checkbox").attr("checked", true).attr("value", routeName)
      .on("change", function() {
        const map = STATE.leafletMap;
        const layer = STATE.routeLayers && STATE.routeLayers[routeName];
        const markers = STATE.routeMarkers && STATE.routeMarkers[routeName];
        if (!map) return;
        if (this.checked) {
          if (layer) layer.addTo(map);
          if (markers) { markers.start.addTo(map); markers.end.addTo(map); }
        } else {
          if (layer) layer.remove();
          if (markers) { markers.start.remove(); markers.end.remove(); }
        }
      });
    const desc = ROUTE_DESCRIPTIONS[routeName] || "";
    label.append("span").style("color", routeColor(routeName)).style("font-weight", "600").text(routeName);
    if (desc) label.append("span").attr("class", "route-desc").style("color", "var(--muted)").style("font-size", "12px").text(` (${desc})`);
  });
}

function initFleetPanel() {
  const fleetOpts = { width: FLEET_CHART_WIDTH, height: FLEET_CHART_HEIGHT };
  if (!REFS.fuel) REFS.fuel = makeScaffold("#FuelChart-div", fleetOpts);
  if (!REFS.costByRoute) REFS.costByRoute = makeScaffold("#CostByRoute-div", fleetOpts);
  if (!REFS.vehicleBreakdown) REFS.vehicleBreakdown = makeScaffold("#VehicleBreakdown-div", fleetOpts);
  loadAllRoutes().then(all => {
    updateCostByRoute(all);
    if (STATE.rows && STATE.rows.length) updateFleetCharts(STATE.rows);
  });
}

function updateFleetCharts(rows) {
  if (!rows || !rows.length) return;
  const hasFuel = rows.some(d => d.fuel_liters != null && isFinite(d.fuel_liters));
  const hasVehicle = rows.some(d => d.vehicle_type);
  if (hasFuel) updateFuelChart(rows); else clearChartPlaceholder(REFS.fuel, "No fuel data for this route.");
  if (hasVehicle) updateVehicleBreakdown(rows); else clearChartPlaceholder(REFS.vehicleBreakdown, "No vehicle type data.");
}

function clearChartPlaceholder(ref, message) {
  if (!ref || !ref.gPlot) return;
  ref.gPlot.selectAll("*").remove();
  ref.gPlot.append("text").attr("class", "chart-placeholder").attr("text-anchor", "middle")
    .attr("x", ref.plotW / 2).attr("y", ref.plotH / 2).attr("fill", "#94a3b8").text(message);
}

function updateFuelChart(rows) {
  const ref = REFS.fuel;
  if (!ref) return;
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, plotW, plotH } = ref;

  const x = d3.scaleTime().domain(d3.extent(rows, d => d.date)).range([0, plotW]);
  const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.fuel_liters) || 1]).nice().range([plotH, 0]);
  const line = d3.line().x(d => x(d.date)).y(d => y(d.fuel_liters)).curve(d3.curveMonotoneX);

  gPlot.selectAll("path.fuel-area").remove();
  gPlot.selectAll("path.fuel-line").data([rows]).join("path").attr("class", "fuel-line line").attr("stroke", "#1170aa").attr("stroke-width", 2.5).attr("d", line)
    .on("mousemove", (ev, d) => { if (d && d.length) { const last = d[d.length - 1]; showTip(`<b>Fuel (L)</b><br>Latest: ${fmtInt(last.fuel_liters)} L`, ev); } })
    .on("mouseleave", hideTip);

  const axisX = d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickSizeOuter(0).tickPadding(10).tickFormat(monthFmt);
  const axisY = d3.axisLeft(y).ticks(5).tickSizeOuter(0).tickPadding(8);
  gX.call(axisX);
  gY.call(axisY);
  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat("")).selectAll("line").attr("class", "gridline").attr("stroke-opacity", 0.6);
  xLabel.text("Date");
  yLabel.text("Fuel (L)");
}

function updateCostByRoute(all) {
  const ref = REFS.costByRoute;
  if (!ref) return;
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, plotW, plotH } = ref;

  const routeNames = Object.keys(all);
  const sums = routeNames.map(r => ({ route: r, cost: d3.sum(all[r], d => d.cost_usd != null ? d.cost_usd : 0) }));
  const x = d3.scaleBand().domain(routeNames).range([0, plotW]).padding(0.35);
  const y = d3.scaleLinear().domain([0, d3.max(sums, d => d.cost) || 1]).nice().range([plotH, 0]);

  const bars = gPlot.selectAll("rect.cost-bar").data(sums, d => d.route);
  bars.join("rect").attr("class", "cost-bar bar").attr("fill", d => routeColor(d.route))
    .attr("x", d => x(d.route)).attr("width", x.bandwidth())
    .attr("y", d => y(d.cost)).attr("height", d => plotH - y(d.cost))
    .attr("rx", 4).on("mousemove", (ev, d) => showTip(`<b>${d.route}</b><br>Total cost: $${fmtInt(Math.round(d.cost))}`, ev))
    .on("mouseleave", hideTip);

  gX.call(d3.axisBottom(x).tickSizeOuter(0).tickPadding(8));
  gY.call(d3.axisLeft(y).ticks(5).tickSizeOuter(0).tickPadding(8).tickFormat(d => "$" + fmtInt(d)));
  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat("")).selectAll("line").attr("class", "gridline").attr("stroke-opacity", 0.6);
  xLabel.text("Route");
  yLabel.text("Total cost (USD)");
}

function updateVehicleBreakdown(rows) {
  const ref = REFS.vehicleBreakdown;
  if (!ref) return;
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, plotW, plotH } = ref;

  const counts = d3.rollup(rows, g => g.length, d => d.vehicle_type);
  const data = Array.from(counts, ([type, count]) => ({ type, count }));
  const x = d3.scaleBand().domain(data.map(d => d.type)).range([0, plotW]).padding(0.35);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count) || 1]).nice().range([plotH, 0]);

  const bars = gPlot.selectAll("rect.vehicle-bar").data(data, d => d.type);
  bars.join("rect").attr("class", "vehicle-bar bar").attr("fill", d => vehicleColor(d.type))
    .attr("x", d => x(d.type)).attr("width", x.bandwidth())
    .attr("y", d => y(d.count)).attr("height", d => plotH - y(d.count))
    .attr("rx", 4).on("mousemove", (ev, d) => showTip(`<b>${d.type}</b><br>${d.count} days`, ev))
    .on("mouseleave", hideTip);

  gX.call(d3.axisBottom(x).tickSizeOuter(0).tickPadding(8));
  gY.call(d3.axisLeft(y).ticks(5).tickSizeOuter(0).tickPadding(8));
  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat("")).selectAll("line").attr("class", "gridline").attr("stroke-opacity", 0.6);
  xLabel.text("Vehicle type");
  yLabel.text("Days");
}

function makeScaffold(sel, opts) {
  const w = (opts && opts.width) || CHART_WIDTH;
  const h = (opts && opts.height) || CHART_HEIGHT;
  const svg = d3.select(sel).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
  const plotW = w - MARGIN.left - MARGIN.right;
  const plotH = h - MARGIN.top - MARGIN.bottom;

  const gPlot = svg.append("g").attr("class", "plot").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const gX = svg.append("g").attr("class", "x-axis").attr("transform", `translate(${MARGIN.left},${MARGIN.top + plotH})`);
  const gY = svg.append("g").attr("class", "y-axis").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const gGridY = svg.append("g").attr("class", "grid-y").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // Place x-label a touch lower; added gap comes mostly from larger bottom margin
  const xLabel = svg.append("text").attr("class", "axis-label x-label").attr("text-anchor", "middle")
    .attr("x", MARGIN.left + plotW / 2).attr("y", h - 6).text("");

  const yLabel = svg.append("text").attr("class", "axis-label y-label").attr("text-anchor", "middle")
    .attr("transform", `translate(16, ${MARGIN.top + plotH / 2}) rotate(-90)`).text("");

  // Inline (HTML) legend in the chart header (outside the plot)
  let legendHtml = null;
  try {
    const card = svg.node().parentNode.closest('.chart-card');
    if (card) {
      const head = d3.select(card).select('.chart-head');
      if (!head.empty()) {
        legendHtml = head.select('.legend-inline');
        if (legendHtml.empty()) legendHtml = head.append('div').attr('class', 'legend-inline');
      }
    }
  } catch(_) {}

  // Keep an SVG legend group (unused when HTML legend exists, but harmless)
  const legend = svg.append("g").attr("class", "legend")
    .attr("transform", `translate(${w - MARGIN.right - 120}, ${MARGIN.top + 8})`)
    .style("display", legendHtml ? "none" : null); // hide if HTML legend is present

  return { svg, gPlot, gX, gY, gGridY, xLabel, yLabel, legend, legendHtml, plotW, plotH };
}

// Utility: render a small HTML legend in the header (labelFn optional, interactive=false for static legend)
function renderHtmlLegend(container, title, items, colorFn, labelFn, interactive) {
  if (!container) return;
  const label = labelFn || (d => d);
  const isInteractive = interactive !== false;
  container.html("");
  container.append("span").attr("class","legend-title").text(title);
  const ul = container.append("ul");

  if (isInteractive && !STATE.activeDayTypes) {
    STATE.activeDayTypes = new Set(items);
  }

  const li = ul.selectAll("li")
    .data(items)
    .join("li")
    .attr("class", d =>
      isInteractive ? `legend-item${STATE.activeDayTypes.has(d) ? "" : " is-inactive"}` : "legend-item"
    )
    .html(d => `<span class="swatch" style="background:${colorFn(d)}"></span>${label(d)}`);

  if (isInteractive) li.on("click", (_, d) => {
      const set = STATE.activeDayTypes || new Set(items);
      if (set.has(d)) {
        // Keep at least one category active to avoid an empty view
        if (set.size === 1) return;
        set.delete(d);
      } else {
        set.add(d);
      }
      STATE.activeDayTypes = set;
      // Re-render legend and charts with updated filters
      renderHtmlLegend(container, title, items, colorFn, labelFn, true);
      update(STATE.rows);
    });
}

// --- Data loader ---
function changeData () {
  const file = d3.select('#dataset').property('value'); // e.g., "route_b.csv"
  const metricUi = d3.select('#metric').property('value');
  STATE.metricKey = METRIC_MAP[metricUi] || METRIC_MAP.attribute1;
  updateBadges();

  d3.csv(`data/${file}`).then(raw => {
    const rows = raw.map(d => {
      const r = {
        date: parseDate(d[DATE_FIELD]),
        group: d.group,
        ridership: +d.ridership,
        on_time_pct: +d.on_time_pct,
        day_type: d[CATEGORY_FIELD],
      };
      if (d.vehicle_type != null && d.vehicle_type !== "") r.vehicle_type = d.vehicle_type;
      if (d.fuel_liters != null && d.fuel_liters !== "") r.fuel_liters = +d.fuel_liters;
      if (d.cost_usd != null && d.cost_usd !== "") r.cost_usd = +d.cost_usd;
      return r;
    }).filter(d => d.date && isFinite(d.ridership) && isFinite(d.on_time_pct));

    rows.sort((a, b) => a.date - b.date);
    STATE.rows = rows;
    update(rows);
    if (STATE.currentPanel === "fleet") updateFleetCharts(rows);
  }).catch(e => {
    console.error("CSV load failed:", e);
    alert('Error loading CSV. Check the filename and data schema.');
  });
}

// --- Master redraw ---
function update (rows) {
  if (!rows?.length) return;

  if (!STATE.activeDayTypes) {
    STATE.activeDayTypes = new Set(rows.map(d => d.day_type));
  }

  const active = STATE.activeDayTypes;
  const filtered = active && active.size
    ? rows.filter(d => active.has(d.day_type))
    : rows;

  if (!filtered.length) return;

  updateHistogramChart(filtered);
  updateLineChart(filtered);
  updateTimeSeriesChart(filtered);
  updateScatterPlot(filtered);
}

// --- Histogram ---
function updateHistogramChart (rows) {
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, plotW, plotH } = REFS.hist;
  const metric = STATE.metricKey;

  const values = rows.map(d => d[metric]);
  const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([0, plotW]);
  const bins = d3.bin().domain(x.domain()).thresholds(24)(values);
  const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length) || 1]).nice().range([plotH, 0]);

  const barGap = 1;
  const bars = gPlot.selectAll("rect.bar").data(bins, d => `${d.x0}-${d.x1}`);

  bars.join(
    enter => enter.append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.x0) + barGap)
      .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - barGap))
      .attr("y", plotH)
      .attr("height", 0)
      .attr("fill", HISTOGRAM_FILL)
      .attr("opacity", 0.94)
      .on("mousemove", (ev,d) => {
        const lo = xTickFormatFor(metric)(d.x0), hi = xTickFormatFor(metric)(d.x1);
        showTip(`<b>${metricNames[metric] || metric}</b><br>Bin: ${lo} – ${hi}<br>Count: ${fmtInt(d.length)}`, ev);
      })
      .on("mouseleave", hideTip)
      .transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
        .attr("y", d => y(d.length))
        .attr("height", d => plotH - y(d.length)),
    update => update
      .on("mousemove", (ev,d) => {
        const lo = xTickFormatFor(metric)(d.x0), hi = xTickFormatFor(metric)(d.x1);
        showTip(`<b>${metricNames[metric] || metric}</b><br>Bin: ${lo} – ${hi}<br>Count: ${fmtInt(d.length)}`, ev);
      })
      .on("mouseleave", hideTip)
      .transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
        .attr("x", d => x(d.x0) + barGap)
        .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - barGap))
        .attr("y", d => y(d.length))
        .attr("height", d => plotH - y(d.length)),
    exit => exit.transition().duration(300).ease(d3.easeCubicInOut)
        .attr("opacity", 0).remove()
  );

  const axisX = d3.axisBottom(x).ticks(6).tickSizeOuter(0).tickPadding(10).tickFormat(xTickFormatFor(metric));
  const axisY = d3.axisLeft(y).ticks(5).tickSizeOuter(0).tickPadding(8);
  gX.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut).call(axisX);
  gY.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut).call(axisY);

  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat(""))
    .selectAll("line").attr("class", "gridline").attr("stroke-opacity", 0.6);

  xLabel.text(metricNames[metric] || metric);
  yLabel.text("Count");
}

// --- Line chart ---
function updateLineChart (rows) {
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, legend, legendHtml, plotW, plotH } = REFS.line;
  const metric = STATE.metricKey;

  const x = d3.scaleTime().domain(d3.extent(rows, d => d.date)).range([0, plotW]);
  const y = d3.scaleLinear().domain(d3.extent(rows, d => d[metric])).nice().range([plotH, 0]);

  const line = d3.line().x(d => x(d.date)).y(d => y(d[metric])).curve(d3.curveMonotoneX);

  // path
  const path = gPlot.selectAll("path.line").data([rows]);
  path.join(
    enter => enter.append("path")
      .attr("class", "line")
      .attr("stroke", LINE_STROKE)
      .attr("d", line)
      .attr("opacity", 0)
      .transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
        .attr("opacity", 1),
    update => update.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
      .attr("d", line),
    exit => exit.transition().duration(300).ease(d3.easeCubicInOut)
      .attr("opacity", 0).remove()
  );

  // dots (date vs selected metric)
  const dots = gPlot.selectAll("circle.pt").data(rows, d => +d.date);
  dots.join(
    enter => enter.append("circle")
      .attr("class", "pt")
      .attr("r", 4.5)
      .attr("cx", d => x(d.date))
      .attr("cy", d => y(d[metric]))
      .attr("fill", d => dayTypeColor(d.day_type))
      .attr("opacity", 0.9)
      .on("mousemove", (ev,d) => {
        showTip(
          `<b>${fullDate(d.date)}</b><br>${metricNames[metric] || metric}: ${yTickFormatFor(metric)(d[metric])}<br>${d.day_type}`,
          ev
        );
      })
      .on("mouseleave", hideTip),
    update => update.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
      .attr("cx", d => x(d.date))
      .attr("cy", d => y(d[metric])),
    exit => exit.transition().duration(250).ease(d3.easeCubicInOut)
      .attr("opacity", 0).remove()
  );

  const axisX = d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickSizeOuter(0).tickPadding(10).tickFormat(monthFmt);
  const axisY = d3.axisLeft(y).ticks(5).tickSizeOuter(0).tickPadding(8).tickFormat(yTickFormatFor(metric));
  gX.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut).call(axisX);
  gY.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut).call(axisY);

  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat(""))
    .selectAll("line").attr("class", "gridline").attr("stroke-opacity", 0.6);

  // Legend in header (HTML)
  if (legendHtml) {
    renderHtmlLegend(legendHtml, "Day type", dayTypeColor.domain(), d => dayTypeColor(d));
  } else {
    // fallback to SVG legend (unlikely now)
    if (legend.select("text.legend-title").empty()) {
      legend.append("text").attr("class","legend-title").attr("x",0).attr("y",-6)
        .style("font-size","12px").style("font-weight","600").text("Day type");
    }
    const cats = dayTypeColor.domain();
    const items = legend.selectAll("g.item").data(cats, d => d);
    const enter = items.enter().append("g").attr("class","item")
      .attr("transform",(d,i)=>`translate(0,${i*18})`);
    enter.append("rect").attr("width",12).attr("height",12);
    enter.append("text").attr("x",18).attr("y",10);
    items.merge(enter).select("rect").attr("fill", d => dayTypeColor(d));
    items.merge(enter).select("text").text(d => d).style("font-size","12px");
  }

  xLabel.text("Date");
  yLabel.text(metricNames[metric] || metric);
}

// --- Time series (ridership + on-time % over time) ---
function updateTimeSeriesChart (rows) {
  const { svg, gPlot, gX, gY, gGridY, xLabel, yLabel, legend, legendHtml, plotW, plotH } = REFS.timeSeries;

  const x = d3.scaleTime().domain(d3.extent(rows, d => d.date)).range([0, plotW]);
  const yRidership = d3.scaleLinear().domain(d3.extent(rows, d => d.ridership)).nice().range([plotH, 0]);
  const yOnTime = d3.scaleLinear().domain(d3.extent(rows, d => d.on_time_pct)).nice().range([plotH, 0]);

  const lineRidership = d3.line().x(d => x(d.date)).y(d => yRidership(d.ridership)).curve(d3.curveMonotoneX);
  const lineOnTime = d3.line().x(d => x(d.date)).y(d => yOnTime(d.on_time_pct)).curve(d3.curveMonotoneX);

  gPlot.selectAll("path.ts-line").remove();
  gPlot.append("path").attr("class", "ts-line line").attr("stroke", TIME_SERIES_COLORS[0])
    .attr("stroke-width", 2.5).attr("d", lineRidership(rows));
  gPlot.append("path").attr("class", "ts-line line").attr("stroke", TIME_SERIES_COLORS[1])
    .attr("stroke-width", 2.5).attr("d", lineOnTime(rows));

  const axisX = d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickSizeOuter(0).tickPadding(10).tickFormat(monthFmt);
  const axisY = d3.axisLeft(yRidership).ticks(5).tickSizeOuter(0).tickPadding(8).tickFormat(fmtInt);
  gX.call(axisX);
  gY.call(axisY);

  let gYRight = svg.select(".y-axis-right");
  if (gYRight.empty()) {
    gYRight = svg.append("g").attr("class", "y-axis y-axis-right")
      .attr("transform", `translate(${MARGIN.left + plotW},${MARGIN.top})`);
  }
  gYRight.call(d3.axisRight(yOnTime).ticks(5).tickSizeOuter(0).tickPadding(8).tickFormat(d => fmtPct(d) + "%"));

  gGridY.call(d3.axisLeft(yRidership).ticks(5).tickSize(-plotW).tickFormat(""))
    .selectAll("line").attr("class", "gridline").attr("stroke-opacity", 0.6);

  if (legendHtml) {
    const keys = ["ridership", "on_time_pct"];
    renderHtmlLegend(legendHtml, "Variables", keys, d => d === "ridership" ? TIME_SERIES_COLORS[0] : TIME_SERIES_COLORS[1], d => STACKED_LABELS[d] || d, false);
  }
  xLabel.text("Date");
  yLabel.text("Ridership");
}

// --- Scatterplot ---
function updateScatterPlot (rows) {
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, legend, legendHtml, plotW, plotH } = REFS.scat;

  const x = d3.scaleLinear().domain(d3.extent(rows, d => d.ridership)).nice().range([0, plotW]);
  const y = d3.scaleLinear().domain(d3.extent(rows, d => d.on_time_pct)).nice().range([plotH, 0]);

  const dots = gPlot.selectAll("circle.dot").data(rows, d => +d.date);
  dots.join(
    enter => enter.append("circle")
      .attr("class", "dot")
      .attr("r", 4.5)
      .attr("cx", d => x(d.ridership))
      .attr("cy", d => y(d.on_time_pct))
      .attr("fill", d => dayTypeColor(d.day_type))
      .attr("opacity", 0.88)
      .on("mousemove", (ev,d) => {
        showTip(
          `<b>${fullDate(d.date)}</b><br>Ridership: ${fmtInt(d.ridership)}<br>On-time: ${fmtPct(d.on_time_pct)}%<br>${d.day_type}`,
          ev
        );
      })
      .on("mouseleave", hideTip),
    update => update.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
      .attr("cx", d => x(d.ridership))
      .attr("cy", d => y(d.on_time_pct)),
    exit => exit.transition().duration(250).ease(d3.easeCubicInOut)
      .attr("opacity", 0).remove()
  );

  const axisX = d3.axisBottom(x).ticks(6).tickSizeOuter(0).tickPadding(10).tickFormat(fmtInt);
  const axisY = d3.axisLeft(y).ticks(5).tickSizeOuter(0).tickPadding(8).tickFormat(d => fmtPct(d) + "%");
  gX.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut).call(axisX);
  gY.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut).call(axisY);

  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat(""))
    .selectAll("line").attr("class", "gridline").attr("stroke-opacity", 0.6);

  // Legend in header (HTML)
  if (legendHtml) {
    renderHtmlLegend(legendHtml, "Day type", dayTypeColor.domain(), d => dayTypeColor(d));
  } else {
    if (legend.select("text.legend-title").empty()) {
      legend.append("text").attr("class","legend-title").attr("x",0).attr("y",-6)
        .style("font-size","12px").style("font-weight","600").text("Day type");
    }
    const cats = dayTypeColor.domain();
    const items = legend.selectAll("g.item").data(cats, d => d);
    const enter = items.enter().append("g").attr("class","item")
      .attr("transform",(d,i)=>`translate(0,${i*18})`);
    enter.append("rect").attr("width",12).attr("height",12);
    enter.append("text").attr("x",18).attr("y",10);
    items.merge(enter).select("rect").attr("fill", d => dayTypeColor(d));
    items.merge(enter).select("text").text(d => d).style("font-size","12px");
  }

  xLabel.text("Ridership");
  yLabel.text("On-time (%)");
}

