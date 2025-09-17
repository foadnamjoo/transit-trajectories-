// ===== Hand-tuned HW2 (root) script.js =====

// --- Constants & helpers ---
const CHART_WIDTH = 500;
const CHART_HEIGHT = 260;
const MARGIN = { left: 50, bottom: 30, top: 20, right: 16 };
const ANIMATION_DURATION = 500;

const METRIC_MAP = { attribute1: "ridership", attribute2: "on_time_pct" };
const CATEGORY_FIELD = "day_type";
const DATE_FIELD = "date";
const parseDate = d3.timeParse("%Y-%m-%d");

const metricNames = {
  ridership: "Ridership (passengers/day)",
  on_time_pct: "On-time performance (%)",
};

// ColorBrewer Set1 (3-class, colorblind-friendly) for day_type
const dayTypeColor = d3.scaleOrdinal()
  .domain(["Weekday", "Weekend", "Holiday"])
  .range(["#e41a1c", "#377eb8", "#4daf4a"]);

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
let STATE = { rows: [], metricKey: METRIC_MAP.attribute1 };
const REFS = { hist: null, line: null, stack: null, scat: null };

// --- UI badges for current selections ---
function updateBadges(){
  const dsText = d3.select('#dataset').select('option:checked').text();
  const metricUi = d3.select('#metric').property('value');
  const mk = METRIC_MAP[metricUi] || METRIC_MAP.attribute1;
  d3.select('#datasetLabel').text(dsText || '—');
  d3.select('#metricLabel').text(metricNames[mk] || mk);
}

// --- Entry point ---
document.addEventListener("DOMContentLoaded", setup);

function setup () {
  d3.select("#dataset").on("change", () => { changeData(); updateBadges(); });
  d3.select("#metric").on("change", () => {
    const ui = d3.select("#metric").property("value");
    STATE.metricKey = METRIC_MAP[ui] || METRIC_MAP.attribute1;
    updateBadges();
    update(STATE.rows);
  });

  // Scaffolds for all charts
  REFS.hist  = makeScaffold("#Histogram-div");
  REFS.line  = makeScaffold("#Linechart-div");
  REFS.stack = makeScaffold("#StackedArea-div");
  REFS.scat  = makeScaffold("#Scatterplot-div");

  updateBadges();
  changeData();
}

function makeScaffold(sel) {
  const svg = d3.select(sel).append("svg").attr("viewBox", `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
  const plotW = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const gPlot = svg.append("g").attr("class", "plot").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const gX = svg.append("g").attr("class", "x-axis").attr("transform", `translate(${MARGIN.left},${MARGIN.top + plotH})`);
  const gY = svg.append("g").attr("class", "y-axis").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const gGridY = svg.append("g").attr("class", "grid-y").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const xLabel = svg.append("text").attr("class", "x-label").attr("text-anchor", "middle")
    .attr("x", MARGIN.left + plotW / 2).attr("y", CHART_HEIGHT - 6).text("");

  const yLabel = svg.append("text").attr("class", "y-label").attr("text-anchor", "middle")
    .attr("transform", `translate(14, ${MARGIN.top + plotH / 2}) rotate(-90)`).text("");

  const legend = svg.append("g").attr("class", "legend")
    .attr("transform", `translate(${CHART_WIDTH - MARGIN.right - 120}, ${MARGIN.top + 8})`);

  return { svg, gPlot, gX, gY, gGridY, xLabel, yLabel, legend, plotW, plotH };
}

// --- Data loader ---
function changeData () {
  const file = d3.select('#dataset').property('value'); // e.g., "route_b.csv"
  const metricUi = d3.select('#metric').property('value');
  STATE.metricKey = METRIC_MAP[metricUi] || METRIC_MAP.attribute1;
  updateBadges();

  d3.csv(`data/${file}`).then(raw => {
    const rows = raw.map(d => ({
      date: parseDate(d[DATE_FIELD]),
      group: d.group,
      ridership: +d.ridership,
      on_time_pct: +d.on_time_pct,
      day_type: d[CATEGORY_FIELD],
    })).filter(d => d.date && isFinite(d.ridership) && isFinite(d.on_time_pct));

    rows.sort((a, b) => a.date - b.date);
    STATE.rows = rows;
    update(rows);
  }).catch(e => {
    console.error("CSV load failed:", e);
    alert('Error loading CSV. Check the filename and data schema.');
  });
}

// --- Master redraw ---
function update (rows) {
  if (!rows?.length) return;
  updateHistogramChart(rows);
  updateLineChart(rows);
  updateStackedAreaChart(rows);
  updateScatterPlot(rows);
}

// --- Histogram ---
function updateHistogramChart (rows) {
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, plotW, plotH } = REFS.hist;
  const metric = STATE.metricKey;

  const values = rows.map(d => d[metric]);
  const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([0, plotW]);
  const bins = d3.bin().domain(x.domain()).thresholds(24)(values);
  const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length) || 1]).nice().range([plotH, 0]);

  const bars = gPlot.selectAll("rect.bar").data(bins, d => `${d.x0}-${d.x1}`);

  bars.join(
    enter => enter.append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.x0) + 1)
      .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr("y", plotH)
      .attr("height", 0)
      .attr("opacity", 0.95)
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
        .attr("x", d => x(d.x0) + 1)
        .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
        .attr("y", d => y(d.length))
        .attr("height", d => plotH - y(d.length)),
    exit => exit.transition().duration(300).ease(d3.easeCubicInOut)
        .attr("opacity", 0).remove()
  );

  gX.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
    .call(d3.axisBottom(x).ticks(6).tickFormat(xTickFormatFor(metric)));
  gY.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
    .call(d3.axisLeft(y).ticks(5));

  // y-grid
  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat(""))
        .selectAll("line").attr("class", "gridline");

  xLabel.text(metricNames[metric] || metric);
  yLabel.text("Count");
}

// --- Line chart ---
function updateLineChart (rows) {
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, legend, plotW, plotH } = REFS.line;
  const metric = STATE.metricKey;

  const x = d3.scaleTime().domain(d3.extent(rows, d => d.date)).range([0, plotW]);
  const y = d3.scaleLinear().domain(d3.extent(rows, d => d[metric])).nice().range([plotH, 0]);

  const line = d3.line().x(d => x(d.date)).y(d => y(d[metric]));

  // path
  const path = gPlot.selectAll("path.line").data([rows]);
  path.join(
    enter => enter.append("path")
      .attr("class", "line")
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
      .attr("r", 5)
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

  gX.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
    .call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(monthFmt));
  gY.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
    .call(d3.axisLeft(y).ticks(5).tickFormat(yTickFormatFor(metric)));

  // y-grid
  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat(""))
        .selectAll("line").attr("class", "gridline");

  // Legend (Day type)
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

  xLabel.text("Date");
  yLabel.text(metricNames[metric] || metric);
}

// --- Stacked area ---
function updateStackedAreaChart (rows) {
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, legend, plotW, plotH } = REFS.stack;

  const table = rows.map(d => ({ date: d.date, ridership: d.ridership, on_time_pct: d.on_time_pct }));
  const keys = ["ridership", "on_time_pct"];

  const x = d3.scaleTime().domain(d3.extent(table, d => d.date)).range([0, plotW]);
  const stack = d3.stack().keys(keys)(table);
  const y = d3.scaleLinear().domain([0, d3.max(stack[stack.length - 1], d => d[1]) || 1]).nice().range([plotH, 0]);

  const area = d3.area().x(d => x(d.data.date)).y0(d => y(d[0])).y1(d => y(d[1]));
  const col = d3.scaleOrdinal().domain(keys).range(["#66c2a5", "#fc8d62"]); // Set2

  const layers = gPlot.selectAll("path.layer").data(stack, d => d.key);
  layers.join(
    enter => enter.append("path")
      .attr("class", "layer")
      .attr("fill", d => col(d.key))
      .attr("d", area)
      .attr("opacity", 0)
      .transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
        .attr("opacity", 0.96),
    update => update.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
      .attr("d", area),
    exit => exit.transition().duration(300).ease(d3.easeCubicInOut)
      .attr("opacity", 0).remove()
  );

  gX.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
    .call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(monthFmt));
  gY.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
    .call(d3.axisLeft(y).ticks(5));

  // y-grid
  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat(""))
        .selectAll("line").attr("class", "gridline");

  // Legend (Variables)
  if (legend.select("text.legend-title").empty()) {
    legend.append("text").attr("class","legend-title").attr("x",0).attr("y",-6)
      .style("font-size","12px").style("font-weight","600").text("Variables");
  }
  const items = legend.selectAll("g.item").data(keys, d => d);
  const enter = items.enter().append("g").attr("class","item")
    .attr("transform",(d,i)=>`translate(0,${i*18})`);
  enter.append("rect").attr("width",12).attr("height",12);
  enter.append("text").attr("x",18).attr("y",10);
  items.merge(enter).select("rect").attr("fill", d => col(d));
  items.merge(enter).select("text").text(d => d).style("font-size","12px");

  xLabel.text("Date");
  yLabel.text("Stacked value");
}

// --- Scatterplot ---
function updateScatterPlot (rows) {
  const { gPlot, gX, gY, gGridY, xLabel, yLabel, legend, plotW, plotH } = REFS.scat;

  const x = d3.scaleLinear().domain(d3.extent(rows, d => d.ridership)).nice().range([0, plotW]);
  const y = d3.scaleLinear().domain(d3.extent(rows, d => d.on_time_pct)).nice().range([plotH, 0]);

  const dots = gPlot.selectAll("circle.dot").data(rows, d => +d.date);
  dots.join(
    enter => enter.append("circle")
      .attr("class", "dot")
      .attr("r", 5)
      .attr("cx", d => x(d.ridership))
      .attr("cy", d => y(d.on_time_pct))
      .attr("fill", d => dayTypeColor(d.day_type))
      .attr("opacity", 0.92)
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

  gX.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
    .call(d3.axisBottom(x).ticks(6).tickFormat(fmtInt));
  gY.transition().duration(ANIMATION_DURATION).ease(d3.easeCubicInOut)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => fmtPct(d) + "%"));

  // y-grid
  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-plotW).tickFormat(""))
        .selectAll("line").attr("class", "gridline");

  // Legend (Day type) — keep in scatter too for quick reference
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

  xLabel.text("Ridership");
  yLabel.text("On-time (%)");
}
