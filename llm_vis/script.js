// llm_vis – Entry #4: scatter made intentionally rough / different
// Keeps Histogram + Line + Stacked Area from Entry #3, but replaces Scatter with a "bad-looking" version.
// NOTE: Still functional; just poor styling/structure by design.

const DATE_PARSE = d3.timeParse("%Y-%m-%d");
const DATA_ROOT = "../data/";

const M = { left: 50, right: 18, top: 20, bottom: 32 };
const W = 500 - M.left - M.right;
const H = 260 - M.top - M.bottom;

const fmtInt = d3.format(",");
const fmtPct = d3.format(".0f");
const monthFmt = d3.timeFormat("%b");
const yTickFormatFor = (metric) => metric === "on_time_pct" ? (d) => fmtPct(d) + "%" : (d) => fmtInt(d);

// “good” palettes retained for other charts
const dayTypeColor = d3.scaleOrdinal()
  .domain(["Weekday","Weekend","Holiday"])
  .range(["#1b9e77","#d95f02","#7570b3"]); // Dark2

const varColor = d3.scaleOrdinal()
  .domain(["ridership","on_time_pct"])
  .range(["#66c2a5","#fc8d62"]); // Set2

const dayTypeSymbol = d3.scaleOrdinal()
  .domain(["Weekday","Weekend","Holiday"])
  .range([d3.symbolCircle, d3.symbolSquare, d3.symbolTriangle]);

// intentionally garish palette JUST for the "bad" scatter
const badColor = d3.scaleOrdinal()
  .domain(["Weekday","Weekend","Holiday"])
  .range(["#ff00ff", "#00ffff", "#ffff00"]); // magenta, cyan, yellow

document.addEventListener("DOMContentLoaded", () => {
  d3.select("#dataset").on("change", changeData);
  d3.select("#metric").on("change", changeData);

  // scaffold for the first three charts (kept from Entry #3)
  ["Histogram-div","Linechart-div","StackedArea-div"].forEach(id => {
    const svg = d3.select("#" + id).append("svg").attr("viewBox", "0 0 500 260");
    svg.append("g").attr("class", "plot").attr("transform", `translate(${M.left},${M.top})`);
    svg.append("g").attr("class", "x-axis").attr("transform", `translate(${M.left},${M.top + H})`);
    svg.append("g").attr("class", "y-axis").attr("transform", `translate(${M.left},${M.top})`);
    svg.append("g").attr("class", "grid-x").attr("transform", `translate(${M.left},${M.top + H})`);
    svg.append("g").attr("class", "grid-y").attr("transform", `translate(${M.left},${M.top})`);
    svg.append("g").attr("class", "legend").attr("transform", `translate(${M.left + W - 130}, ${M.top + 10})`);
  });

  // Scatter gets NO pre-scaffold; we'll rebuild the whole SVG each time on purpose
  d3.select("#Scatterplot-div").classed("ugly-scatter", true);

  changeData();
});

function changeData() {
  const file = d3.select("#dataset").property("value");
  const metric = d3.select("#metric").property("value");

  d3.csv(DATA_ROOT + file).then(raw => {
    const rows = raw.map(d => ({
      date: DATE_PARSE(d.date),
      group: d.group,
      ridership: +d.ridership,
      on_time_pct: +d.on_time_pct,
      day_type: d.day_type
    })).filter(d => d.date);

    rows.sort((a, b) => a.date - b.date);

    updateHistogram(rows, metric);
    updateLineAlt(rows, metric);
    updateStackedAreaAlt(rows);
    updateScatterUgly(rows); // intentionally rough version
  }).catch(err => {
    console.error("Failed to load CSV:", err);
    alert("Error loading CSV. Check ../data/ and filenames.");
  });
}

/* ---------------- Histogram (same as Entry #3) ---------------- */
function updateHistogram(rows, metric) {
  const svg = d3.select("#Histogram-div svg");
  const gPlot = svg.select(".plot");
  const gX = svg.select(".x-axis");
  const gY = svg.select(".y-axis");
  const gGridY = svg.select(".grid-y");

  const values = rows.map(d => d[metric]).filter(Number.isFinite);
  const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([0, W]);
  const bins = d3.bin().domain(x.domain()).thresholds(24)(values);
  const y = d3.scaleLinear().domain([0, d3.max(bins, b => b.length) || 1]).nice().range([H, 0]);

  const t = svg.transition().duration(600).ease(d3.easeCubicInOut);

  const bars = gPlot.selectAll("rect.bar").data(bins, d => `${d.x0}-${d.x1}`);
  bars.join(
    enter => enter.append("rect").attr("class", "bar")
      .attr("x", d => x(d.x0) + 1)
      .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr("y", H).attr("height", 0).attr("opacity", 0.95)
      .call(e => e.transition(t).attr("y", d => y(d.length)).attr("height", d => H - y(d.length))),
    update => update.call(u => u.transition(t)
      .attr("x", d => x(d.x0) + 1).attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr("y", d => y(d.length)).attr("height", d => H - y(d.length))),
    exit => exit.call(xe => xe.transition(t).attr("opacity", 0).remove())
  );

  const xTickFmt = (metric === "on_time_pct") ? (d => d + "%") : fmtInt;
  gX.transition(t).call(d3.axisBottom(x).ticks(6).tickFormat(xTickFmt));
  gY.transition(t).call(d3.axisLeft(y).ticks(5));
  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-W).tickFormat("")).selectAll("line").attr("class","gridline");
}

/* ---------------- Line (ALT from Entry #3) ---------------- */
function updateLineAlt(rows, metric) {
  const svg = d3.select("#Linechart-div svg");
  const gPlot = svg.select(".plot");
  const gX = svg.select(".x-axis");
  const gY = svg.select(".y-axis");
  const gGridY = svg.select(".grid-y");
  const legend = svg.select(".legend");

  const x = d3.scaleTime().domain(d3.extent(rows, d => d.date)).range([0, W]);
  const y = d3.scaleLinear().domain(d3.extent(rows, d => d[metric])).nice().range([H, 0]);

  const line = d3.line().curve(d3.curveMonotoneX).x(d => x(d.date)).y(d => y(d[metric]));
  const t = svg.transition().duration(650).ease(d3.easeCubicInOut);

  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-W).tickFormat("")).selectAll("line").attr("class","gridline");
  gX.transition(t).call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(monthFmt));
  gY.transition(t).call(d3.axisLeft(y).ticks(5).tickFormat(yTickFormatFor(metric)));

  gPlot.selectAll("path.path-line").data([rows]).join(
    enter => enter.append("path").attr("class","path-line").attr("d", line).attr("opacity",0)
      .call(e => e.transition(t).attr("opacity",1)),
    update => update.call(u => u.transition(t).attr("d", line))
  );

  const sym = d3.symbol().size(52);
  const pts = gPlot.selectAll("path.pt-shape").data(rows, d => +d.date);
  pts.join(
    enter => enter.append("path").attr("class","pt-shape")
      .attr("transform", d => `translate(${x(d.date)},${y(d[metric])})`)
      .attr("d", d => sym.type(dayTypeSymbol(d.day_type))())
      .attr("fill", d => dayTypeColor(d.day_type))
      .attr("opacity", 0)
      .call(e => e.transition().duration(300).ease(d3.easeCubicInOut).attr("opacity", 0.96)),
    update => update.call(u => u.transition(t)
      .attr("transform", d => `translate(${x(d.date)},${y(d[metric])})`)
      .attr("d", d => sym.type(dayTypeSymbol(d.day_type))())),
    exit => exit.call(xe => xe.transition().duration(250).attr("opacity",0).remove())
  );

  if (legend.select("text.legend-title").empty()) {
    legend.append("text").attr("class","legend-title").attr("x",0).attr("y",-6)
      .style("font-size","12px").style("font-weight","600").text("Day type");
  }
  const cats = dayTypeColor.domain();
  const items = legend.selectAll("g.item").data(cats, d => d);
  const enter = items.enter().append("g").attr("class","item").attr("transform",(d,i)=>`translate(0,${i*18})`);
  enter.append("rect").attr("width", 12).attr("height", 12);
  enter.append("text").attr("x", 18).attr("y", 10);
  items.merge(enter).select("rect").attr("fill", d => dayTypeColor(d));
  items.merge(enter).select("text").text(d => d).style("font-size","12px");
  items.merge(enter).attr("transform",(d,i)=>`translate(0,${i*18})`);
}

/* ---------------- Stacked Area (ALT from Entry #3) ---------------- */
function updateStackedAreaAlt(rows) {
  const svg = d3.select("#StackedArea-div svg");
  const gPlot = svg.select(".plot");
  const gX = svg.select(".x-axis");
  const gY = svg.select(".y-axis");
  const gGridY = svg.select(".grid-y");
  const legend = svg.select(".legend");

  const table = rows.map(d => ({ date: d.date, ridership: d.ridership, on_time_pct: d.on_time_pct }));
  const keys = ["ridership","on_time_pct"];
  const x = d3.scaleTime().domain(d3.extent(table,d => d.date)).range([0, W]);

  const stack = d3.stack().keys(keys)(table);
  const yMax = d3.max(stack[stack.length - 1], d => d[1]) || 1;
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([H, 0]);

  const area = d3.area().curve(d3.curveMonotoneX).x(d => x(d.data.date)).y0(d => y(d[0])).y1(d => y(d[1]));
  const t = svg.transition().duration(650).ease(d3.easeCubicInOut);

  gGridY.call(d3.axisLeft(y).ticks(5).tickSize(-W).tickFormat("")).selectAll("line").attr("class","gridline");
  gX.transition(t).call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(monthFmt));
  gY.transition(t).call(d3.axisLeft(y).ticks(5));

  gPlot.selectAll("path.layer").data(stack, d => d.key).join(
    enter => enter.append("path").attr("class","layer").attr("fill", d => varColor(d.key)).attr("d", area).attr("opacity", 0)
      .call(e => e.transition(t).attr("opacity", 0.9)),
    update => update.call(u => u.transition(t).attr("d", area))
  );

  if (legend.select("text.legend-title").empty()) {
    legend.append("text").attr("class","legend-title").attr("x",0).attr("y",-6)
      .style("font-size","12px").style("font-weight","600").text("Variables");
  }
  const items = legend.selectAll("g.item").data(keys, d => d);
  const enter = items.enter().append("g").attr("class","item").attr("transform",(d,i)=>`translate(0,${i*18})`);
  enter.append("rect").attr("width", 12).attr("height", 12);
  enter.append("text").attr("x", 18).attr("y", 10);
  items.merge(enter).select("rect").attr("fill", d => varColor(d));
  items.merge(enter).select("text").text(d => d).style("font-size","12px");
  items.merge(enter).attr("transform",(d,i)=>`translate(0,${i*18})`);
}

/* ---------------- Scatter (INTENTIONALLY ROUGH) ---------------- */
function updateScatterUgly(rows) {
  // Nuke and rebuild the entire SVG every time (inefficient by design)
  const wrap = d3.select("#Scatterplot-div");
  wrap.selectAll("*").remove();

  const svg = wrap.append("svg"); // no viewBox; fixed size via CSS class
  const g = svg.append("g").attr("transform", "translate(40,10)");
  const innerW = 420; // smaller than others
  const innerH = 170;

  // raw, dense ticks; no formatting helpers
  const x = d3.scaleLinear().domain(d3.extent(rows, d => d.ridership)).nice().range([0, innerW]);
  const y = d3.scaleLinear().domain(d3.extent(rows, d => d.on_time_pct)).nice().range([innerH, 0]);

  // Axes: too many ticks, default formatting, small labels
  g.append("g").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(10))
    .selectAll("text").style("font-size","9px");

  g.append("g")
    .call(d3.axisLeft(y).ticks(10))
    .selectAll("text").style("font-size","9px");

  // Big opaque squares, no stroke; garish colors
  g.selectAll("rect.ugly-dot")
    .data(rows, d => +d.date)
    .join("rect")
      .attr("class", "ugly-dot")
      .attr("x", d => x(d.ridership) - 6)
      .attr("y", d => y(d.on_time_pct) - 6)
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", d => badColor(d.day_type))
      .attr("opacity", 1);

  // Cramped legend overlapping the plot area (top-left), no title
  const legend = g.append("g").attr("class","ugly-legend").attr("transform","translate(2,2)");
  const cats = badColor.domain();
  const li = legend.selectAll("g").data(cats).join("g").attr("transform",(d,i)=>`translate(0,${i*14})`);
  li.append("rect").attr("width", 10).attr("height", 10).attr("fill", d => badColor(d));
  li.append("text").attr("x", 14).attr("y", 9).text(d => d);
}
