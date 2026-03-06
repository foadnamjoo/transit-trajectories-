// ===== Hand-tuned HW2 (root) script.js =====

// --- Constants & helpers ---
const CHART_WIDTH = 640;
const CHART_HEIGHT = 320;
const FLEET_CHART_WIDTH = 640;
const FLEET_CHART_HEIGHT = 320;
const MARGIN = { left: 72, bottom: 48, top: 28, right: 24 };
const MARGIN_DUAL_AXIS = { left: 72, bottom: 48, top: 28, right: 48 };
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
const DATA_VERSION = "7";
let DATA_BASE = "data"; // set to "data/serving" when pipeline outputs exist
const CHART_IDS = ["histogram", "line", "timeseries", "scatter", "emissions", "cost", "vehicle", "ridershipByRoute", "forecast", "quality"];
const CHART_LABELS = { histogram: "Histogram", line: "Line Chart", timeseries: "Time series", scatter: "Scatterplot", emissions: "Emissions", cost: "Cost by route", vehicle: "Vehicle usage", ridershipByRoute: "Ridership by route", forecast: "Forecast", quality: "Data Quality" };
const TIME_SERIES_KEYS = ["ridership", "on_time_pct"];
let STATE = {
  rows: [], metricKey: METRIC_MAP.attribute1, allRoutes: null, trajectories: null, routeShapes: null,
  kpis: null, quality: null, forecast: null, anomalies: null,
  visibleCharts: Object.fromEntries(CHART_IDS.map(id => [id, true])),
  activeTimeSeriesVars: new Set(TIME_SERIES_KEYS)
};
const REFS = { hist: null, line: null, timeSeries: null, scat: null, fuel: null, costByRoute: null, vehicleBreakdown: null, ridershipByRoute: null, forecastChart: null };
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
  STATE.currentPanel = "summary";

  d3.select("#dataset").on("change", () => {
    changeData();
    updateBadges();
    drawForecastChart("#SummaryForecast-div");
  });
  d3.select("#metric").on("change", () => {
    const ui = d3.select("#metric").property("value");
    STATE.metricKey = METRIC_MAP[ui] || METRIC_MAP.attribute1;
    updateBadges();
    update(STATE.rows);
  });

  // Scaffolds for overview charts
  REFS.hist  = makeScaffold("#Histogram-div");
  REFS.line  = makeScaffold("#Linechart-div");
  REFS.timeSeries = makeScaffold("#TimeSeries-div", { margin: MARGIN_DUAL_AXIS });
  REFS.scat  = makeScaffold("#Scatterplot-div");

  // Fleet & emissions scaffolds
  initFleetPanel();

  // Show/hide each plot (deselected = card disappears)
  function updateRestoreBar() {
    const bar = document.getElementById("chart-restore-bar");
    if (!bar) return;
    bar.innerHTML = "";
    CHART_IDS.filter(id => !STATE.visibleCharts[id]).forEach(id => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "restore-btn";
      btn.textContent = "Show " + (CHART_LABELS[id] || id);
      btn.addEventListener("click", () => {
        STATE.visibleCharts[id] = true;
        const card = document.querySelector(`.chart-card[data-chart="${id}"]`);
        if (card) { card.classList.remove("chart-card-hidden"); const cb = card.querySelector(".chart-toggle input[type=checkbox]"); if (cb) cb.checked = true; }
        updateRestoreBar();
      });
      bar.appendChild(btn);
    });
  }
  CHART_IDS.forEach(id => {
    const card = document.querySelector(`.chart-card[data-chart="${id}"]`);
    if (!card) return;
    const cb = card.querySelector(".chart-toggle input[type=checkbox]");
    if (cb) {
      cb.checked = STATE.visibleCharts[id] !== false;
      cb.addEventListener("change", function() {
        STATE.visibleCharts[id] = this.checked;
        card.classList.toggle("chart-card-hidden", !this.checked);
        updateRestoreBar();
      });
      card.classList.toggle("chart-card-hidden", !STATE.visibleCharts[id]);
    }
  });
  updateRestoreBar();

  // Click on plot to open zoom modal (ignore clicks on Show checkbox); enable drag and zoom in modal
  function initModalChartZoom(container) {
    const svg = container.querySelector(".chart-svg");
    if (!svg) return;
    const sel = d3.select(svg);
    const zoomGroup = sel.insert("g", ":first-child").attr("class", "zoom-group");
    const toMove = Array.from(svg.querySelectorAll(":scope > *")).filter(n => n !== zoomGroup.node());
    toMove.forEach(n => zoomGroup.node().appendChild(n));
    const zoom = d3.zoom()
      .scaleExtent([0.4, 8])
      .on("zoom", function(ev) { zoomGroup.attr("transform", ev.transform); })
      .on("start", function() { sel.style("cursor", "grabbing"); })
      .on("end", function() { sel.style("cursor", "grab"); });
    sel.call(zoom).on("dblclick.zoom", null);
    sel.style("cursor", "grab");
  }
  const grid = document.getElementById("charts-grid-10");
  if (grid) {
    grid.addEventListener("click", function(ev) {
      const plot = ev.target.closest(".chart-plot");
      if (!plot || ev.target.closest(".chart-toggle")) return;
      const card = plot.closest(".chart-card");
      const titleEl = card ? card.querySelector(".chart-head h3") : null;
      const title = titleEl ? titleEl.textContent : "Chart";
      const modal = document.getElementById("chart-modal");
      const body = document.querySelector(".chart-modal-body");
      const titleBar = document.querySelector(".chart-modal-title");
      if (!modal || !body) return;
      body.innerHTML = "";
      const clone = plot.cloneNode(true);
      clone.style.cursor = "default";
      body.appendChild(clone);
      initModalChartZoom(body);
      if (titleBar) titleBar.textContent = title;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      const closeBtn = document.querySelector(".chart-modal-close");
      if (closeBtn) closeBtn.focus();
    });
  }
  function closeChartModal() {
    const modal = document.getElementById("chart-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    const body = document.querySelector(".chart-modal-body");
    if (body) body.innerHTML = "";
  }
  document.querySelector(".chart-modal-backdrop")?.addEventListener("click", closeChartModal);
  document.querySelector(".chart-modal-close")?.addEventListener("click", closeChartModal);
  document.getElementById("chart-modal")?.addEventListener("keydown", function(ev) {
    if (ev.key === "Escape") closeChartModal();
  });

  // Drag-to-resize modal (and thus the chart) from bottom-right handle
  (function() {
    const content = document.getElementById("chart-modal-content");
    const handle = content?.querySelector(".chart-modal-resize-handle");
    if (!content || !handle) return;
    let startX, startY, startW, startH;
    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let w = Math.max(320, Math.min(window.innerWidth - 40, startW + dx));
      let h = Math.max(300, Math.min(window.innerHeight - 40, startH + dy));
      content.style.width = w + "px";
      content.style.height = h + "px";
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    handle.addEventListener("mousedown", function(ev) {
      ev.preventDefault();
      startX = ev.clientX;
      startY = ev.clientY;
      startW = content.offsetWidth;
      startH = content.offsetHeight;
      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  })();

  // Prefer pipeline serving data if present
  d3.csv("data/serving/route_a.csv").then(() => { DATA_BASE = "data/serving"; }).catch(() => {}).finally(() => {
    loadServingJson();
  updateBadges();
  changeData();
  });
}

function switchPanel(name) {
  STATE.currentPanel = name;
  d3.selectAll(".panel").classed("active", false);
  const panelIds = { summary: "panel-summary", forecast: "panel-forecast", quality: "panel-quality" };
  const panelId = panelIds[name] || "panel-summary";
  d3.select("#" + panelId).classed("active", true);
  if (name === "forecast") initForecastPanel();
  if (name === "quality") initQualityPanel();
  if (name === "summary") {
    if (STATE.kpis) renderKpiCards();
    drawForecastChart("#SummaryForecast-div");
    drawQualityHeatmap("#SummaryQuality-div", { maxDates: 10, noHorizontalScroll: true });
  }
}

function loadAllRoutes() {
  if (STATE.allRoutes) return Promise.resolve(STATE.allRoutes);
  const base = DATA_BASE;
  return Promise.all(ROUTE_FILES.map(f => d3.csv(`${base}/${f}?v=${DATA_VERSION}`))).then(rawArrays => {
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

function loadRouteShapes() {
  if (STATE.routeShapes) return Promise.resolve(STATE.routeShapes);
  return d3.csv(`${DATA_BASE}/route_shapes.csv?v=${DATA_VERSION}`).then(raw => {
    const grouped = d3.group(raw, d => d.route);
    const shapes = {};
    grouped.forEach((vals, route) => {
      shapes[route] = vals
        .map(d => ({
          seq: +d.seq,
          lat: +d.lat,
          lon: +d.lon,
        }))
        .filter(d => isFinite(d.lat) && isFinite(d.lon))
        .sort((a, b) => a.seq - b.seq)
        .map(d => [d.lat, d.lon]);
    });
    STATE.routeShapes = shapes;
    return shapes;
  });
}

function initMapPanel() {
  const container = d3.select("#city-map");
  if (STATE.leafletMap) return;
  function drawWhenReady() {
    requestAnimationFrame(() => {
      const el = document.getElementById("city-map");
      if (el && el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0) {
        drawLeafletMap();
        renderMapLegend();
        return;
      }
      setTimeout(drawWhenReady, 50);
    });
  }

  if (!STATE.routeShapes) {
    container.html("<p class='map-loading'>Loading routes…</p>");
    loadRouteShapes().then(() => {
      container.html("");
      drawWhenReady();
    }).catch(() => container.html("<p class='map-loading'>Could not load route data.</p>"));
  } else {
    container.html("");
    drawWhenReady();
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
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> &copy; <a href=\"https://carto.com/attributions\">CARTO</a>",
    maxZoom: 19,
    subdomains: "abcd"
  }).addTo(map);

  const routePane = map.createPane("routes");
  routePane.style.zIndex = 450;

  const routeLayers = {};
  const routeMarkers = {};
  const allBounds = [];

  Object.keys(STATE.routeShapes || {}).forEach(routeName => {
    const raw = STATE.routeShapes[routeName] || [];
    if (!raw.length) return;
    const coords = raw.map(p => [Number(p[0]), Number(p[1])]);
    if (!coords.length) return;

    // Soft glow behind the main route line
    L.polyline(coords, {
      color: "#0f172a",
      weight: 14,
      opacity: 0.9,
      pane: "routes",
      className: "route-path-glow"
    }).addTo(map);

    const polyline = L.polyline(coords, {
      color: routeColor(routeName),
      weight: 5,
      opacity: 1,
      pane: "routes",
      className: "route-path"
    }).addTo(map);

    polyline.on("mouseover", function() {
      this.setStyle({ weight: 7, opacity: 1 });
    });
    polyline.on("mouseout", function() {
      if (STATE.highlightedRoute !== routeName)
        this.setStyle({ weight: 5, opacity: 1 });
    });
    polyline.on("click", function() {
      STATE.highlightedRoute = STATE.highlightedRoute === routeName ? null : routeName;
      Object.keys(routeLayers).forEach(r => {
        routeLayers[r].setStyle({ weight: STATE.highlightedRoute === r ? 7 : 4, opacity: STATE.highlightedRoute === r ? 1 : 0.4 });
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

  let combinedBounds = null;
  if (allBounds.length) {
    combinedBounds = allBounds[0].clone();
    allBounds.forEach(b => combinedBounds.extend(b));
    map.fitBounds(combinedBounds.pad(0.15));
  }

  setTimeout(() => {
    map.invalidateSize();
    if (combinedBounds) map.fitBounds(combinedBounds.pad(0.15));
  }, 150);
  STATE.leafletMap = map;
  STATE.routeLayers = routeLayers;
  STATE.routeMarkers = routeMarkers;
  updateMapAnomalyLayer();
}

function updateMapAnomalyLayer() {
  const map = STATE.leafletMap;
  if (!map || !STATE.routeShapes) return;
  if (STATE.anomalyLayer) { STATE.anomalyLayer.remove(); STATE.anomalyLayer = null; }
  if (!STATE.showAnomalies || !STATE.anomalies || !STATE.anomalies.length) return;
  const group = L.layerGroup();
  STATE.anomalies.forEach(a => {
    const coords = STATE.routeShapes[a.route];
    if (!coords || !coords.length) return;
    const pt = coords[0];
    L.marker([pt[0], pt[1]], {
      icon: L.divIcon({
        html: `<span style="background:#f59e0b;color:#fff;padding:2px 5px;border-radius:4px;font-size:9px;">!</span>`,
        className: "anomaly-marker",
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      })
    }).addTo(group).bindTooltip(`${a.route} ${a.date} (cost $${fmtInt(a.cost_usd)})`, { permanent: false });
  });
  group.addTo(map);
  STATE.anomalyLayer = group;
}

function renderMapLegend() {
  const wrap = d3.select("#map-legend").html("");
  Object.keys(STATE.routeShapes || {}).forEach(routeName => {
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

function loadServingJson() {
  const base = "data/serving";
  const v = "v=" + (DATA_VERSION || "1");
  Promise.all([
    d3.json(`${base}/kpis.json?${v}`).catch(() => null),
    d3.json(`${base}/quality.json?${v}`).catch(() => null),
    d3.json(`${base}/forecast.json?${v}`).catch(() => null),
    d3.json(`${base}/anomalies.json?${v}`).catch(() => null)
  ]).then(([kpis, quality, forecast, anomalies]) => {
    STATE.kpis = kpis || [];
    STATE.quality = quality || [];
    STATE.forecast = forecast || [];
    STATE.anomalies = anomalies || [];
    renderKpiCards();
    drawForecastChart("#SummaryForecast-div");
    drawQualityHeatmap("#SummaryQuality-div", { maxDates: 10, noHorizontalScroll: true });
  });
}

function renderKpiCards() {
  const el = d3.select("#kpi-cards");
  el.html("");
  if (!STATE.kpis || !STATE.kpis.length) return;
  const byRoute = d3.groups(STATE.kpis, d => d.route);
  const totals = { ridership: d3.sum(STATE.kpis, d => d.ridership), cost: d3.sum(STATE.kpis, d => d.cost_usd), co2: d3.sum(STATE.kpis, d => d.co2_kg) };
  el.append("div").attr("class", "kpi-card").html("<strong>Total ridership</strong><br><span class='kpi-val'>" + fmtInt(totals.ridership) + "</span>");
  el.append("div").attr("class", "kpi-card").html("<strong>Total cost</strong><br><span class='kpi-val'>$" + fmtInt(Math.round(totals.cost)) + "</span>");
  el.append("div").attr("class", "kpi-card").html("<strong>Total CO₂ (kg)</strong><br><span class='kpi-val'>" + fmtInt(Math.round(totals.co2)) + "</span>");
  el.append("div").attr("class", "kpi-card").html("<strong>Routes</strong><br><span class='kpi-val'>" + byRoute.length + "</span>");
}

function drawForecastChart(containerSelector) {
  const sel = d3.select(containerSelector);
  if (sel.empty()) return;
  sel.html("");
  if (!STATE.forecast || !STATE.forecast.length) { sel.append("p").attr("class", "chart-placeholder").style("padding", "1em").style("color", "var(--muted)").text("No forecast data (run pipeline or use demo data)."); return; }
  const w = CHART_WIDTH, h = CHART_HEIGHT;
  const plotW = w - MARGIN.left - MARGIN.right, plotH = h - MARGIN.top - MARGIN.bottom;
  const r = d3.select("#dataset").property("value").replace("route_", "").replace(".csv", "");
  const routeName = "Route " + (r.charAt(0).toUpperCase() + r.slice(1));
  const data = STATE.forecast.filter(d => d.route === routeName).slice(-60);
  if (!data.length) { sel.append("p").attr("class", "chart-placeholder").style("padding", "1em").style("color", "var(--muted)").text("No forecast for " + routeName); return; }
  const svg = sel.append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("class", "chart-svg");
  const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const x = d3.scaleTime().domain(d3.extent(data, d => new Date(d.date))).range([0, plotW]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => Math.max(d.ridership_actual, d.ridership_forecast))]).nice().range([plotH, 0]);
  g.append("path").attr("class", "line").attr("stroke", "#1170aa").attr("stroke-width", 2).attr("fill", "none")
    .attr("d", d3.line().x(d => x(new Date(d.date))).y(d => y(d.ridership_actual)).curve(d3.curveMonotoneX)(data));
  g.append("path").attr("class", "line").attr("stroke", "#c55a11").attr("stroke-width", 1.5).attr("stroke-dasharray", "4 2").attr("fill", "none")
    .attr("d", d3.line().x(d => x(new Date(d.date))).y(d => y(d.ridership_forecast)).curve(d3.curveMonotoneX)(data));
  svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top + plotH})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%b")));
  svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`).call(d3.axisLeft(y));
  svg.append("text").attr("class", "axis-label x-label").attr("text-anchor", "middle")
    .attr("x", MARGIN.left + plotW / 2).attr("y", h - 6).text("Date");
  svg.append("text").attr("class", "axis-label y-label").attr("text-anchor", "middle")
    .attr("transform", `translate(10, ${MARGIN.top + plotH / 2}) rotate(-90)`).text("Ridership");
  const legend = svg.append("g").attr("class", "forecast-legend").attr("transform", `translate(${MARGIN.left},${MARGIN.top + 8})`);
  legend.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 24).attr("y2", 0).attr("stroke", "#1170aa").attr("stroke-width", 2);
  legend.append("text").attr("x", 30).attr("y", 4).attr("font-size", "11px").attr("fill", "var(--fg)").text("Actual");
  legend.append("line").attr("x1", 0).attr("y1", 16).attr("x2", 24).attr("y2", 16).attr("stroke", "#c55a11").attr("stroke-width", 1.5).attr("stroke-dasharray", "4 2");
  legend.append("text").attr("x", 30).attr("y", 20).attr("font-size", "11px").attr("fill", "var(--fg)").text("Forecast");
}

function drawQualityHeatmap(containerSelector, opts) {
  const el = d3.select(containerSelector);
  if (el.empty()) return;
  el.html("");
  if (!STATE.quality || !STATE.quality.length) { el.append("p").attr("class", "chart-placeholder").style("padding", "1em").style("color", "var(--muted)").text("No quality data (run pipeline or use demo data)."); return; }
  const routes = [...new Set(STATE.quality.map(d => d.route))].sort();
  const maxDates = (opts && opts.maxDates) || 30;
  const dates = [...new Set(STATE.quality.map(d => d.date))].sort().slice(-maxDates);
  const color = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 1]);
  const noScroll = opts && opts.noHorizontalScroll;
  const wrap = el.append("div").attr("class", "quality-heatmap-wrap" + (noScroll ? " quality-heatmap-no-scroll" : ""))
    .style("overflow", noScroll ? "hidden" : "auto").style("max-height", "100%");
  const table = wrap.append("table").attr("class", "quality-table" + (noScroll ? " quality-table-fit" : ""));
  const thead = table.append("thead").append("tr");
  thead.append("th").text("Route");
  dates.forEach(d => thead.append("th").text(d.slice(5)));
  const tbody = table.append("tbody");
  routes.forEach(route => {
    const row = tbody.append("tr");
    row.append("td").text(route);
    dates.forEach(date => {
      const q = STATE.quality.find(r => r.route === route && r.date === date);
      const score = q ? q.quality_score : null;
      row.append("td").attr("class", "qcell").style("background", score != null ? color(score) : "#eee").text(score != null ? score.toFixed(2) : "—");
    });
  });
}

function initForecastPanel() {
  const listEl = d3.select("#Anomalies-list");
  listEl.html("");
  if (STATE.anomalies && STATE.anomalies.length) {
    listEl.append("ul").selectAll("li").data(STATE.anomalies.slice(0, 20)).join("li").html(d => `${d.route} ${d.date}: ridership ${fmtInt(d.ridership)}, cost $${fmtInt(d.cost_usd)}`);
  } else listEl.text("No anomaly records (run pipeline or use demo data).");
  drawForecastChart("#ForecastChart-div");
}

function initQualityPanel() {
  const el = d3.select("#Quality-heatmap");
  el.html("");
  drawQualityHeatmap("#Quality-heatmap");
}

function initFleetPanel() {
  const fleetOpts = { width: FLEET_CHART_WIDTH, height: FLEET_CHART_HEIGHT };
  if (!REFS.fuel) REFS.fuel = makeScaffold("#FuelChart-div", fleetOpts);
  if (!REFS.costByRoute) REFS.costByRoute = makeScaffold("#CostByRoute-div", fleetOpts);
  if (!REFS.vehicleBreakdown) REFS.vehicleBreakdown = makeScaffold("#VehicleBreakdown-div", fleetOpts);
  if (!REFS.ridershipByRoute) REFS.ridershipByRoute = makeScaffold("#RidershipByRoute-div", fleetOpts);
  loadAllRoutes().then(all => {
    updateCostByRoute(all);
    updateRidershipByRoute(all);
    if (STATE.rows && STATE.rows.length) updateFleetCharts(STATE.rows);
  });
}

function updateFleetCharts(rows) {
  if (!rows || !rows.length) return;
  const hasFuel = rows.some(d =>
    (d.fuel_liters != null && isFinite(d.fuel_liters)) ||
    (d.co2_kg != null && isFinite(d.co2_kg))
  );
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
  const y = d3.scaleLinear().domain([
    0,
    d3.max(rows, d => d.co2_kg != null ? d.co2_kg : d.fuel_liters) || 1
  ]).nice().range([plotH, 0]);
  const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.co2_kg != null ? d.co2_kg : d.fuel_liters))
    .curve(d3.curveMonotoneX);

  gPlot.selectAll("path.fuel-area").remove();
  gPlot.selectAll("path.fuel-line").data([rows]).join("path")
    .attr("class", "fuel-line line")
    .attr("stroke", "#1170aa")
    .attr("stroke-width", 2.5)
    .attr("d", line)
    .on("mousemove", (ev, d) => {
      if (d && d.length) {
        const last = d[d.length - 1];
        const fuel = last.fuel_liters;
        const co2 = last.co2_kg;
        showTip(
          `<b>Emissions & fuel</b><br>` +
          (co2 != null ? `CO₂: ${fmtInt(co2)} kg<br>` : "") +
          (fuel != null ? `Fuel: ${fmtInt(fuel)} L` : ""),
          ev
        );
      }
    })
    .on("mouseleave", hideTip);

  const axisX = d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickSizeOuter(0).tickPadding(10).tickFormat(monthFmt);
  const axisY = d3.axisLeft(y).ticks(5).tickSizeOuter(0).tickPadding(8);
  gX.call(axisX);
  gY.call(axisY);
  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat("")).selectAll("line").attr("class", "gridline").attr("stroke-opacity", 0.6);
  xLabel.text("Date");
  yLabel.text("Tailpipe CO\u2082 (kg)");
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

function updateRidershipByRoute(all) {
  const ref = REFS.ridershipByRoute;
  if (!ref) return;
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, plotW, plotH } = ref;

  const routeNames = Object.keys(all);
  const sums = routeNames.map(r => ({ route: r, ridership: d3.sum(all[r], d => d.ridership) }));
  const x = d3.scaleBand().domain(routeNames).range([0, plotW]).padding(0.35);
  const y = d3.scaleLinear().domain([0, d3.max(sums, d => d.ridership) || 1]).nice().range([plotH, 0]);

  const bars = gPlot.selectAll("rect.ridership-route-bar").data(sums, d => d.route);
  bars.join("rect").attr("class", "ridership-route-bar bar").attr("fill", d => routeColor(d.route))
    .attr("x", d => x(d.route)).attr("width", x.bandwidth())
    .attr("y", d => y(d.ridership)).attr("height", d => plotH - y(d.ridership))
    .attr("rx", 4).on("mousemove", (ev, d) => showTip(`<b>${d.route}</b><br>Total ridership: ${fmtInt(d.ridership)}`, ev))
    .on("mouseleave", hideTip);

  gX.call(d3.axisBottom(x).tickSizeOuter(0).tickPadding(8));
  gY.call(d3.axisLeft(y).ticks(5).tickSizeOuter(0).tickPadding(8).tickFormat(d => fmtInt(d)));
  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat("")).selectAll("line").attr("class", "gridline").attr("stroke-opacity", 0.6);
  xLabel.text("Route");
  yLabel.text("Total ridership");
}

function makeScaffold(sel, opts) {
  const w = (opts && opts.width) || CHART_WIDTH;
  const h = (opts && opts.height) || CHART_HEIGHT;
  const margin = (opts && opts.margin) || MARGIN;
  const svg = d3.select(sel).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("class", "chart-svg");
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;

  const gPlot = svg.append("g").attr("class", "plot").attr("transform", `translate(${margin.left},${margin.top})`);
  const gX = svg.append("g").attr("class", "x-axis").attr("transform", `translate(${margin.left},${margin.top + plotH})`);
  const gY = svg.append("g").attr("class", "y-axis").attr("transform", `translate(${margin.left},${margin.top})`);
  const gGridY = svg.append("g").attr("class", "grid-y").attr("transform", `translate(${margin.left},${margin.top})`);

  const xLabel = svg.append("text").attr("class", "axis-label x-label").attr("text-anchor", "middle")
    .attr("x", margin.left + plotW / 2).attr("y", h - 6).text("");

  const yLabel = svg.append("text").attr("class", "axis-label y-label").attr("text-anchor", "middle")
    .attr("transform", `translate(10, ${margin.top + plotH / 2}) rotate(-90)`).text("");

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

  const legend = svg.append("g").attr("class", "legend")
    .attr("transform", `translate(${w - margin.right - 120}, ${margin.top + 8})`)
    .style("display", legendHtml ? "none" : null);

  return { svg, gPlot, gX, gY, gGridY, xLabel, yLabel, legend, legendHtml, plotW, plotH, margin };
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

  d3.csv(`${DATA_BASE}/${file}?v=${DATA_VERSION}`).then(raw => {
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
      if (d.co2_kg != null && d.co2_kg !== "") r.co2_kg = +d.co2_kg;
      return r;
    }).filter(d => d.date && isFinite(d.ridership) && isFinite(d.on_time_pct));

    rows.sort((a, b) => a.date - b.date);
    STATE.rows = rows;
    update(rows);
    updateFleetCharts(rows);
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
  const xDomain = metric === "on_time_pct" ? [0, 100] : d3.extent(values);
  const x = d3.scaleLinear().domain(xDomain).nice().range([0, plotW]);
  const bins = d3.bin().domain(x.domain()).thresholds(metric === "on_time_pct" ? 20 : 24)(values);
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
  const y = d3.scaleLinear()
    .domain(metric === "on_time_pct" ? [0, 100] : [0, d3.max(rows, d => d[metric]) || 1])
    .nice()
    .range([plotH, 0]);

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
  const { svg, gPlot, gX, gY, gGridY, xLabel, yLabel, legend, legendHtml, plotW, plotH, margin } = REFS.timeSeries;
  const m = margin || MARGIN;
  const active = STATE.activeTimeSeriesVars || new Set(TIME_SERIES_KEYS);

  const x = d3.scaleTime().domain(d3.extent(rows, d => d.date)).range([0, plotW]);
  const yRidership = d3.scaleLinear().domain([0, d3.max(rows, d => d.ridership) || 1]).nice().range([plotH, 0]);
  const yOnTime = d3.scaleLinear().domain([0, 100]).range([plotH, 0]);

  const lineRidership = d3.line().x(d => x(d.date)).y(d => yRidership(d.ridership)).curve(d3.curveMonotoneX);
  const lineOnTime = d3.line().x(d => x(d.date)).y(d => yOnTime(d.on_time_pct)).curve(d3.curveMonotoneX);

  gPlot.selectAll("path.ts-line").remove();
  gPlot.append("path").attr("class", "ts-line ts-line-ridership line").attr("stroke", TIME_SERIES_COLORS[0])
    .attr("stroke-width", 2.5).attr("d", lineRidership(rows))
    .attr("opacity", active.has("ridership") ? 1 : 0);
  gPlot.append("path").attr("class", "ts-line ts-line-ontime line").attr("stroke", TIME_SERIES_COLORS[1])
    .attr("stroke-width", 2.5).attr("d", lineOnTime(rows))
    .attr("opacity", active.has("on_time_pct") ? 1 : 0);

  const axisX = d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickSizeOuter(0).tickPadding(10).tickFormat(monthFmt);
  const axisY = d3.axisLeft(yRidership).ticks(5).tickSizeOuter(0).tickPadding(8).tickFormat(fmtInt);
  gX.call(axisX);
  gY.call(axisY);

  let gYRight = svg.select(".y-axis-right");
  if (gYRight.empty()) {
    gYRight = svg.append("g").attr("class", "y-axis y-axis-right")
      .attr("transform", `translate(${m.left + plotW},${m.top})`);
  }
  gYRight.call(d3.axisRight(yOnTime).ticks(5).tickSizeOuter(0).tickPadding(8).tickFormat(d => fmtPct(d) + "%"));
  gYRight.attr("visibility", active.has("on_time_pct") ? "visible" : "hidden");

  gGridY.call(d3.axisLeft(yRidership).ticks(5).tickSize(-plotW).tickFormat(""))
    .selectAll("line").attr("class", "gridline").attr("stroke-opacity", 0.6);

  if (legendHtml) {
    legendHtml.html("");
    legendHtml.append("span").attr("class", "legend-title").text("Variables");
    const ul = legendHtml.append("ul");
    TIME_SERIES_KEYS.forEach(key => {
      const li = ul.append("li")
        .attr("class", "legend-item" + (active.has(key) ? "" : " is-inactive"))
        .style("cursor", "pointer")
        .html(`<span class="swatch" style="background:${key === "ridership" ? TIME_SERIES_COLORS[0] : TIME_SERIES_COLORS[1]}"></span>${STACKED_LABELS[key] || key}`);
      li.on("click", () => {
        if (active.has(key)) {
          if (active.size === 1) return;
          active.delete(key);
  } else {
          active.add(key);
        }
        STATE.activeTimeSeriesVars = active;
        updateTimeSeriesChart(STATE.rows);
      });
    });
  }
  xLabel.text("Date");
  yLabel.text("Ridership");
}

// --- Scatterplot ---
function updateScatterPlot (rows) {
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, legend, legendHtml, plotW, plotH } = REFS.scat;

  const xExtent = d3.extent(rows, d => d.ridership);
  const yExtent = d3.extent(rows, d => d.on_time_pct);
  const xSpan = (xExtent[1] - xExtent[0]) || 1;
  const ySpan = (yExtent[1] - yExtent[0]) || 1;
  const pad = 0.08;
  const x = d3.scaleLinear()
    .domain([xExtent[0] - xSpan * pad, xExtent[1] + xSpan * pad])
    .nice()
    .range([0, plotW]);
  const y = d3.scaleLinear()
    .domain([yExtent[0] - ySpan * pad, yExtent[1] + ySpan * pad])
    .nice()
    .range([plotH, 0]);

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

