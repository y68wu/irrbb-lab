import { CONFIG, CURVE_SNAPSHOTS, SAMPLE_INPUTS } from "./config.mjs";
import { analyzeIRRBB, BANK, DEFAULT_INPUTS, runScenarios, SCENARIOS } from "./engine.mjs";

const MONTHS = 12;
const PERIWINKLE = "#aabefb";
const COPPER = "#ffb08a";
const $ = (id) => document.getElementById(id);
const text = (id, value) => { $(id).textContent = value; };
const percent = new Intl.NumberFormat("en-CA", { style: "percent", maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" });
const compactDate = (asOf) => date.format(new Date(`${asOf}T00:00:00Z`));
const pct = (value) => percent.format(value);
const scenarioNames = new Map(SCENARIOS.map(({ id, label }) => [id, label]));

function money(value, showSign = false) {
  const rounded = Math.round(Math.abs(value) * 100_000) / 100_000;
  const sign = rounded === 0 ? "" : value < 0 ? "−" : showSign ? "+" : "";
  return rounded >= 1
    ? `${sign}$${rounded.toFixed(2)}B`
    : `${sign}$${(rounded * 1000).toFixed(2)}M`;
}

function svg(parent, tag, attrs, label) {
  const item = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
  if (label !== undefined) item.textContent = label;
  parent.append(item);
  return item;
}

function html(tag, value, className) {
  const item = document.createElement(tag);
  if (value !== undefined) item.textContent = value;
  if (className) item.className = className;
  return item;
}

function linear(low, high, start, end) {
  return (value) => start + (value - low) / (high - low) * (end - start);
}

function domain(values, minimumStep = 0.05) {
  const floor = Math.min(...values), ceiling = Math.max(...values);
  const raw = Math.max(minimumStep, (ceiling - floor) / 4);
  const unit = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((n) => n * unit >= raw) ?? 10) * unit;
  const low = Math.floor(floor / step) * step, high = Math.ceil(ceiling / step) * step;
  return { low, high: high === low ? low + step * 2 : high, step };
}

function gridLine(chart, x1, y1, x2, y2, cls = "chart-grid") {
  svg(chart, "line", { x1, y1, x2, y2, class: cls });
}

function axis(chart, x, y, label, anchor = "middle") {
  svg(chart, "text", { x, y, class: "chart-axis", "text-anchor": anchor }, label);
}

function plotPath(data, x, y, xKey, yKey, stepped = false) {
  return data.map((point, index) => {
    const horizontal = x(point[xKey]).toFixed(2), vertical = y(point[yKey]).toFixed(2);
    if (index === 0) return `M${horizontal},${vertical}`;
    return stepped ? `H${horizontal} V${vertical}` : `L${horizontal},${vertical}`;
  }).join(" ");
}

function axesY(chart, bounds, frame, y, formatter) {
  for (let value = bounds.low; value <= bounds.high + bounds.step * .001; value += bounds.step) {
    const coordinate = y(value);
    const zero = Math.abs(value) < bounds.step * .0001;
    gridLine(chart, frame.left, coordinate, frame.right, coordinate, zero ? "chart-zero" : "chart-grid");
    axis(chart, frame.left - 9, coordinate + 4, formatter(zero ? 0 : value), "end");
  }
}

function stroke(chart, d, color, extra = {}) {
  return svg(chart, "path", {
    d, fill: "none", stroke: color, "stroke-width": 2.6, "stroke-linecap": "round",
    "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke", ...extra,
  });
}

function drawCurve(data, asOf, inputs) {
  const chart = $("curve-chart");
  chart.replaceChildren();
  const frame = { left: 61, right: 534, top: 24, bottom: 218 };
  const rates = domain(data.flatMap(({ base, shocked }) => [base, shocked]), .005);
  const x = linear(Math.log(data[0].tenor), Math.log(data.at(-1).tenor), frame.left, frame.right);
  const tenorX = (years) => x(Math.log(years));
  const y = linear(rates.low, rates.high, frame.bottom, frame.top);
  axesY(chart, rates, frame, y, pct);
  for (const tenor of [.25, 1, 2, 5, 10, 30]) {
    gridLine(chart, tenorX(tenor), frame.top, tenorX(tenor), frame.bottom);
    axis(chart, tenorX(tenor), frame.bottom + 24, tenor === .25 ? "3M" : `${tenor}Y`);
  }
  stroke(chart, plotPath(data, tenorX, y, "tenor", "base"), "#d0daf0", { "stroke-dasharray": "5 5" });
  stroke(chart, plotPath(data, tenorX, y, "tenor", "shocked"), PERIWINKLE);
  const atTen = data.find((row) => row.tenor === 10);
  const circle = svg(chart, "circle", { cx: tenorX(10), cy: y(atTen.shocked), r: 4, fill: PERIWINKLE });
  svg(circle, "title", {}, `10Y shocked yield ${pct(atTen.shocked)} · ${atTen.shockBps.toFixed(0)} bp move`);
  text("curve-case", `${scenarioNames.get(inputs.scenario)} · ${pct(inputs.shockScale)}`);
  text("curve-date", `Bank of Canada · ${compactDate(asOf)}`);
}

function drawReplayLine(id, rows, bothTimings, key, color, stepped) {
  const chart = $(id);
  chart.replaceChildren();
  const frame = { left: 68, right: 536, top: 18, bottom: 137 };
  const bounds = domain([0, ...bothTimings.flatMap((path) => path.map((row) => row[key]))], .025);
  const x = linear(0, MONTHS, frame.left, frame.right);
  const y = linear(bounds.low, bounds.high, frame.bottom, frame.top);
  axesY(chart, bounds, frame, y, (value) => `${Math.round(value * 1000)}`);
  [0, 3, 6, 9, 12].forEach((month) => {
    gridLine(chart, x(month), frame.top, x(month), frame.bottom);
    axis(chart, x(month), frame.bottom + 23, `M${month}`);
  });

  const defs = svg(chart, "defs", {});
  const clipping = svg(defs, "clipPath", { id: `${id}-visible` });
  const clip = svg(clipping, "rect", { x: frame.left - 6, y: 0, width: 0, height: 173 });
  const shown = svg(chart, "g", { "clip-path": `url(#${id}-visible)` });
  stroke(shown, plotPath(rows, x, y, "month", key, stepped), color);
  const cursor = svg(chart, "line", { y1: frame.top, y2: frame.bottom, class: "chart-zero" });
  const point = svg(chart, "circle", { r: 4.5, fill: color, stroke: "#111b2e", "stroke-width": 1.4 });
  return (progress) => {
    const month = Math.floor(progress);
    const current = rows[month][key];
    const next = rows[Math.min(month + 1, MONTHS)][key];
    const value = stepped ? current : current + (next - current) * (progress - month);
    const px = x(progress);
    clip.setAttribute("width", px - frame.left + 6.5);
    cursor.setAttribute("x1", px);
    cursor.setAttribute("x2", px);
    point.setAttribute("cx", px);
    point.setAttribute("cy", y(value));
  };
}

function drawReference(rows, selected) {
  const body = $("scenario-rows");
  body.replaceChildren();
  const worst = rows.reduce((largest, row) => row.eveLossToTier1 > largest.eveLossToTier1 ? row : largest);
  for (const row of rows) {
    const tr = html("tr");
    tr.dataset.current = String(row.id === selected);
    const title = html("th", row.label);
    title.scope = "row";
    const delta = html("td", money(row.deltaEve, true));
    delta.dataset.negative = String(row.deltaEve < 0);
    const loss = html("td", pct(row.eveLossToTier1));
    const result = html("td");
    const badge = html("span", row.breach ? "Above" : "Within", "screen-tag");
    badge.dataset.breach = String(row.breach);
    result.append(badge);
    tr.append(title, delta, loss, result);
    body.append(tr);
  }
  const max = Math.max(.22, worst.eveLossToTier1 * 1.1);
  $("worst-fill").style.width = pct(worst.eveLossToTier1 / max);
  $("tier-marker").style.left = pct(BANK.outlierLimit / max);
  $("worst-ratio").closest(".outlier").dataset.breach = String(worst.breach);
  text("worst-ratio", pct(worst.eveLossToTier1));
  text("worst-name", worst.label);
  text("screen-caption", worst.breach
    ? `The largest EVE loss is ${money(-worst.deltaEve)}. It exceeds the illustrative Tier 1 screen.`
    : `The largest adverse EVE loss is ${money(Math.max(0, -worst.deltaEve))} under the current inputs.`);
}

function drawHedgeComparison() {
  const reference = runScenarios(CONFIG, DEFAULT_INPUTS);
  const hedged = runScenarios(CONFIG, { ...DEFAULT_INPUTS, hedgeNotional: SAMPLE_INPUTS.hedgeNotional });
  const largestLoss = (rows) => Math.max(...rows.map((row) => row.eveLossToTier1));
  const downNii = (rows) => rows.find((row) => row.id === "parallel_down").deltaNii;
  const note = $("hedge-insight");
  note.append(
    html("strong", "REFERENCE HEDGE COMPARISON", "micro"),
    html("span", `On the opening curve, a CAD ${SAMPLE_INPUTS.hedgeNotional}B pay-fixed swap moves the worst EVE loss from ${pct(largestLoss(reference))} to ${pct(largestLoss(hedged))} of Tier 1. In the immediate parallel-down case, ΔNII moves from ${money(downNii(reference), true)} to ${money(downNii(hedged), true)}. Customer behaviour stays fixed.`),
  );
  note.hidden = false;
}

function drawGap(rows) {
  const body = $("gap-rows");
  body.replaceChildren();
  for (const row of rows) {
    const tr = html("tr");
    const title = html("th", row.label);
    title.scope = "row";
    const gap = html("td", row.gap.toFixed(2));
    gap.dataset.negative = String(row.gap < 0);
    tr.append(title, html("td", row.assets.toFixed(2)), html("td", row.liabilities.toFixed(2)), gap);
    body.append(tr);
  }
  const chart = $("gap-chart");
  chart.replaceChildren();
  const frame = { left: 63, right: 536, top: 25, bottom: 244 };
  const bounds = domain([0, ...rows.map((row) => row.gap)], 2);
  const y = linear(bounds.low, bounds.high, frame.bottom, frame.top);
  axesY(chart, bounds, frame, y, (value) => value.toFixed(0));
  const width = (frame.right - frame.left) / rows.length;
  rows.forEach((row, index) => {
    const x = frame.left + width * (index + .5);
    const bar = svg(chart, "rect", {
      x: x - width * .29, y: y(Math.max(0, row.gap)), width: width * .58,
      height: Math.abs(y(row.gap) - y(0)), rx: 2,
      fill: row.gap < 0 ? "#b76a4c" : "#557cbd",
    });
    svg(bar, "title", {}, `${row.label} · ${money(row.gap, true)}`);
    axis(chart, x, frame.bottom + 24, row.label.replace(/^>/, ""));
  });
}

function drawProducts(id, rows) {
  const list = $(id);
  list.replaceChildren();
  for (const product of rows) {
    const pair = html("div");
    pair.append(html("dt", product.label), html("dd", money(product.balance)));
    list.append(pair);
  }
}

function setup() {
  const timing = { instant: $("mode-instant"), ramp: $("mode-ramp") };
  const controls = {
    scenario: $("scenario"), shockScale: $("shock-scale"), cpr: $("cpr"), depositBeta: $("deposit-beta"),
    depositDecayYears: $("deposit-decay"), hedgeNotional: $("hedge"),
  };
  const snapshots = $("curve-snapshot");
  for (const { id, label } of SCENARIOS) controls.scenario.append(new Option(label, id));
  for (const curve of CURVE_SNAPSHOTS) snapshots.append(new Option(compactDate(curve.asOf), curve.asOf));
  const slider = $("replay-scrub");
  const play = $("replay-play");
  const restart = $("replay-restart");
  const speed = $("replay-speed");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let config = CONFIG;
  let activeTiming = DEFAULT_INPUTS.timing;
  let path;
  let chartUpdate = [];
  let outputs;
  let progress = MONTHS;
  let drawnMonth = -1;
  let animation = null;
  let lastTime = null;

  function readControls() {
    return {
      scenario: controls.scenario.value,
      shockScale: Number(controls.shockScale.value) / 100,
      cpr: Number(controls.cpr.value) / 100,
      depositBeta: Number(controls.depositBeta.value) / 100,
      depositDecayYears: Number(controls.depositDecayYears.value),
      hedgeNotional: Number(controls.hedgeNotional.value),
    };
  }

  function showControls() {
    const next = readControls();
    const parallel = next.scenario.startsWith("parallel");
    const direction = next.scenario.endsWith("down") ? "−" : "+";
    const bp = parallel && next.shockScale > 0
      ? ` · ${direction}${Math.round(CONFIG.shocks.parallel * next.shockScale)} bp` : "";
    text("shock-scale-value", `${pct(next.shockScale)}${bp}`);
    text("cpr-value", `${pct(next.cpr)} CPR`);
    text("deposit-beta-value", next.depositBeta.toFixed(2));
    text("deposit-decay-value", `${next.depositDecayYears.toFixed(1)} yr`);
    text("hedge-value", `CAD ${next.hedgeNotional}B`);
  }

  function fillControls(inputs, asOf = CONFIG.curve.asOf) {
    controls.scenario.value = inputs.scenario;
    controls.shockScale.value = inputs.shockScale * 100;
    controls.cpr.value = inputs.cpr * 100;
    controls.depositBeta.value = inputs.depositBeta * 100;
    controls.depositDecayYears.value = inputs.depositDecayYears;
    controls.hedgeNotional.value = inputs.hedgeNotional;
    snapshots.value = asOf;
    showControls();
  }

  function paintMonth() {
    const month = Math.floor(progress);
    for (const paint of chartUpdate) paint(reducedMotion.matches ? month : progress);
    if (month === drawnMonth) return;
    drawnMonth = month;
    const row = path[month];
    slider.value = month;
    slider.setAttribute("aria-valuetext", `Month ${month} of ${MONTHS}`);
    text("replay-month", `Month ${month} / ${MONTHS}`);
    text("replay-phase", month === 0 ? "Opening position" : `${pct(row.shockFraction)} of shock applied`);
    text("live-eve", money(row.deltaEve, true));
    text("live-nii", money(row.deltaNii, true));
  }

  function setMode(mode) {
    activeTiming = mode;
    for (const [key, button] of Object.entries(timing)) button.setAttribute("aria-pressed", String(mode === key));
    path = outputs[mode].monthly;
    const timelines = [outputs.instant.monthly, outputs.ramp.monthly];
    chartUpdate = [
      drawReplayLine("eve-chart", path, timelines, "deltaEve", PERIWINKLE, mode === "instant"),
      drawReplayLine("nii-chart", path, timelines, "deltaNii", COPPER, false),
    ];
    drawnMonth = -1;
    paintMonth();
  }

  function stop() {
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
    lastTime = null;
    play.setAttribute("aria-pressed", "false");
    play.textContent = progress === MONTHS ? "Replay" : "Play";
  }

  function tick(now) {
    if (lastTime !== null) {
      const elapsedSeconds = Math.min(now - lastTime, 100) / 1000;
      progress = Math.min(MONTHS, progress + elapsedSeconds * 1.35 * Number(speed.value));
      paintMonth();
    }
    lastTime = now;
    if (progress < MONTHS) animation = requestAnimationFrame(tick);
    else {
      stop();
      const end = path.at(-1);
      text("replay-status", `Replay complete. Month 12 ΔEVE ${money(end.deltaEve, true)}; cumulative ΔNII ${money(end.deltaNii, true)}.`);
    }
  }

  function start(reset = false) {
    stop();
    if (reset || progress === MONTHS) progress = 0;
    paintMonth();
    play.setAttribute("aria-pressed", "true");
    play.textContent = "Pause";
    text("replay-status", `Playing from month ${Math.floor(progress)}.`);
    animation = requestAnimationFrame(tick);
  }

  function apply(inputs, mode, animate) {
    stop();
    config = { ...CONFIG, curve: CURVE_SNAPSHOTS.find((curve) => curve.asOf === snapshots.value) };
    outputs = {
      instant: analyzeIRRBB(config, { ...inputs, timing: "instant" }),
      ramp: analyzeIRRBB(config, { ...inputs, timing: "ramp" }),
    };
    progress = animate ? 0 : MONTHS;
    const instant = outputs.instant;
    const { summary } = instant;
    setMode(mode);
    drawCurve(instant.curve, config.curve.asOf, inputs);
    drawGap(instant.gap);
    drawReference(runScenarios(config, { ...inputs, shockScale: 1, timing: "instant" }), inputs.scenario);
    text("active-case", `${scenarioNames.get(inputs.scenario)} · ${pct(inputs.shockScale)} scale · ${pct(inputs.cpr)} CPR · ${inputs.depositBeta.toFixed(2)} beta · CAD ${inputs.hedgeNotional}B hedge`);
    text("final-eve", money(summary.deltaEve, true));
    text("instant-nii", money(summary.deltaNii, true));
    text("ramp-nii", money(outputs.ramp.summary.deltaNii, true));
    text("swap-eve", money(summary.swapEve, true));
    if (animate) {
      $("replay").scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "start" });
      start(true);
    } else {
      stop();
      text("replay-status", "Showing the end of the reference scenario. Play to watch the full 12-month path.");
    }
  }

  $("shock-form").addEventListener("submit", (event) => {
    event.preventDefault();
    apply(readControls(), activeTiming, true);
  });
  $("load-sample").addEventListener("click", () => {
    fillControls(SAMPLE_INPUTS);
    apply(readControls(), SAMPLE_INPUTS.timing, true);
  });
  for (const [mode, button] of Object.entries(timing)) {
    button.addEventListener("click", () => {
      if (mode === activeTiming) return;
      setMode(mode);
      text("replay-status", `${mode === "instant" ? "Instant" : "Ramp"} timing selected at month ${Math.floor(progress)}.`);
    });
  }
  play.addEventListener("click", () => {
    if (animation === null) start();
    else {
      stop();
      text("replay-status", `Paused at month ${Math.floor(progress)}.`);
    }
  });
  restart.addEventListener("click", () => start(true));
  slider.addEventListener("input", () => {
    progress = Number(slider.value);
    stop();
    paintMonth();
    text("replay-status", `Showing month ${progress}.`);
  });
  for (const input of Object.values(controls)) input.addEventListener("input", showControls);

  text("hero-assets", money(BANK.totalAssets));
  text("hero-capital", money(BANK.tier1));
  drawProducts("asset-list", BANK.assets);
  drawProducts("liability-list", BANK.liabilities);
  drawHedgeComparison();
  fillControls(DEFAULT_INPUTS);
  apply(DEFAULT_INPUTS, DEFAULT_INPUTS.timing, false);
  for (const control of [...Object.values(controls), snapshots, ...Object.values(timing), play, restart, slider, speed, $("load-sample"), $("run-scenario")]) {
    control.disabled = false;
  }
}

try {
  setup();
} catch (error) {
  console.error(error);
  $("app-error").hidden = false;
}
