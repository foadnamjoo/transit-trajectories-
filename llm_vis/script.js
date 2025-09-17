// llm_vis – Step 1: Histogram only (D3 v7)
const DATE_PARSE = d3.timeParse("%Y-%m-%d");
const DATA_ROOT = "../data/"; // IMPORTANT: llm_vis/ is a subfolder

// shared dims for all charts
const M = { left: 50, right: 16, top: 20, bottom: 30 };
const W = 500 - M.left - M.right;
const H = 260 - M.top - M.bottom;

// formatters
const fmtInt = d3.format(",");
const fmtPct = d3.format(".0f");

document.addEventListener("DOMContentLoaded", () => {
  d3.select("#dataset").on("change", changeData);
  d3.select("#metric").on("change", changeData);

  // Pre-create SVG scaffolds (axes groups) for all containers
  ["Histogram-div","Linechart-div","StackedArea-div","Scatterplot-div"].forEach(id => {
    const svg = d3.select("#" + id).append("svg")
      .attr("viewBox", "0 0 500 260");
    svg.append("g").attr("class", "plot").attr("transform", `translate(${M.left},${M.top})`);
    svg.append("g").attr("class", "x-axis").attr("transform", `translate(${M.left},${M.top + H})`);
    svg.append("g").attr("class", "y-axis").attr("transform", `translate(${M.left},${M.top})`);
  });

  changeData();
});

// Loads selected CSV then updates histogram
function changeData() {
  const file = d3.select("#dataset").property("value");
  const metric = d3.select("#metric").property("value");

  const url = DATA_ROOT + file;
  d3.csv(url).then(raw => {
    const rows = raw.map(d => ({
      date: DATE_PARSE(d.date),
      group: d.group,
      ridership: +d.ridership,
      on_time_pct: +d.on_time_pct,
      day_type: d.day_type
    })).filter(d => d.date);

    rows.sort((a, b) => a.date - b.date);

    updateHistogram(rows, metric);
    // (Other charts will be added in later steps)
  }).catch(err => {
    console.error("Failed to load CSV:", err);
    alert("Error loading CSV. Check ../data/ and filenames.");
  });
}

function updateHistogram(rows, metric) {
  const svg = d3.select("#Histogram-div svg");
  const gPlot = svg.select(".plot");
  const gX = svg.select(".x-axis");
  const gY = svg.select(".y-axis");

  const values = rows.map(d => d[metric]).filter(v => Number.isFinite(v));
  const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([0, W]);
  const bins = d3.bin().domain(x.domain()).thresholds(24)(values);
  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, b => b.length) || 1])
    .nice()
    .range([H, 0]);

  const t = svg.transition().duration(600).ease(d3.easeCubicInOut);

  const bars = gPlot.selectAll("rect.bar").data(bins, d => `${d.x0}-${d.x1}`);

  bars.join(
    enter => enter.append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.x0) + 1)
      .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr("y", H)
      .attr("height", 0)
      .attr("opacity", 0.95)
      .call(e => e.transition(t)
        .attr("y", d => y(d.length))
        .attr("height", d => H - y(d.length))),
    update => update
      .call(u => u.transition(t)
        .attr("x", d => x(d.x0) + 1)
        .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
        .attr("y", d => y(d.length))
        .attr("height", d => H - y(d.length))),
    exit => exit.call(xe => xe.transition(t).attr("opacity", 0).remove())
  );

  // Axes: thousands for ridership, percent for on_time_pct
  const xTickFmt = (metric === "on_time_pct") ? (d => d + "%") : fmtInt;
  gX.transition(t).call(d3.axisBottom(x).ticks(6).tickFormat(xTickFmt));
  gY.transition(t).call(d3.axisLeft(y).ticks(5));
}
