/** Reproduce the tables in the IRRBB case study using the browser engine. */
import { mkdir, writeFile } from "node:fs/promises";
import { analyzeIRRBB, runScenarios, DEFAULT_INPUTS, BANK } from "../docs/assets/engine.mjs";
import { CONFIG, CURVE_SNAPSHOTS, SAMPLE_INPUTS } from "../docs/assets/config.mjs";

const root = new URL("../reports/", import.meta.url);
await mkdir(root, { recursive: true });

const round = (value) => typeof value === "number" ? Number(value.toFixed(8)) : value;
const field = (value) => {
  const text = String(round(value));
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
async function table(name, rows) {
  const keys = Object.keys(rows[0]);
  const lines = rows.map((row) => keys.map((key) => field(row[key])).join(","));
  await writeFile(new URL(`${name}.csv`, root), [keys.join(","), ...lines, ""].join("\n"));
}

function screen(config, inputs) {
  const scenarios = runScenarios(config, { ...inputs, shockScale: 1 });
  const worst = scenarios.reduce((a, b) => a.deltaEve <= b.deltaEve ? a : b);
  return {
    worstScenario: worst.id,
    worstDeltaEve: worst.deltaEve,
    worstLossToTier1: worst.eveLossToTier1,
    breach: worst.breach,
  };
}

const referenceInputs = { ...DEFAULT_INPUTS, scenario: "parallel_up", shockScale: 1 };
const reference = analyzeIRRBB(CONFIG, referenceInputs);
const sample = analyzeIRRBB(CONFIG, SAMPLE_INPUTS);
const scenarios = runScenarios(CONFIG, referenceInputs);
const hedgedScenarios = runScenarios(CONFIG, { ...referenceInputs, hedgeNotional: SAMPLE_INPUTS.hedgeNotional });
const hedgeSweep = Array.from({ length: 41 }, (_, index) => {
  const hedgeNotional = index / 2;
  const inputs = { ...referenceInputs, hedgeNotional };
  const up = analyzeIRRBB(CONFIG, inputs).summary;
  const down = analyzeIRRBB(CONFIG, { ...inputs, scenario: "parallel_down" }).summary;
  return {
    hedgeNotional,
    ...screen(CONFIG, inputs),
    upDeltaEve: up.deltaEve, upDeltaNii: up.deltaNii,
    downDeltaEve: down.deltaEve, downDeltaNii: down.deltaNii,
  };
});

const sensitivity = [
  ["cpr", [0.02, 0.08, 0.18]],
  ["depositBeta", [0.20, 0.40, 0.75]],
  ["depositDecayYears", [2, 4, 6]],
].flatMap(([assumption, levels]) => levels.map((value) => {
  const inputs = { ...referenceInputs, [assumption]: value };
  return {
    assumption, value, ...screen(CONFIG, inputs),
    parallelUpDeltaNii: analyzeIRRBB(CONFIG, inputs).summary.deltaNii,
  };
}));

const regimes = CURVE_SNAPSHOTS.map((curve) => {
  const config = { ...CONFIG, curve };
  return {
    date: curve.asOf,
    threeMonthZero: curve.rates[0],
    tenYearZero: curve.rates[curve.tenors.indexOf(10)],
    ...screen(config, referenceInputs),
    parallelUpDeltaNii: analyzeIRRBB(config, referenceInputs).summary.deltaNii,
  };
});

const paths = ["instant", "ramp"].flatMap((timing) =>
  analyzeIRRBB(CONFIG, { ...SAMPLE_INPUTS, timing }).monthly.map((row) => ({ timing, ...row }))
);

await Promise.all([
  table("scenarios_unhedged", scenarios),
  table("scenarios_hedged", hedgedScenarios),
  table("repricing_gap", reference.gap),
  table("sample_path", paths),
  table("hedge_sweep", hedgeSweep),
  table("behavior_sensitivity", sensitivity),
  table("curve_regimes", regimes),
]);

const summary = {
  asOf: CONFIG.curve.asOf,
  tier1: BANK.tier1,
  units: "CAD billions unless noted",
  reference: { inputs: reference.inputs, ...reference.summary, ...screen(CONFIG, referenceInputs) },
  sample: { inputs: sample.inputs, ...sample.summary, ...screen(CONFIG, SAMPLE_INPUTS) },
  firstPassingHedgeOnGrid: hedgeSweep.find((row) => !row.breach) ?? null,
};
await writeFile(new URL("summary.json", root), JSON.stringify(summary, (_, value) => round(value), 2) + "\n");
console.log(JSON.stringify(summary, (_, value) => round(value), 2));
