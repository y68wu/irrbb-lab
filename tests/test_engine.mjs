import assert from "node:assert/strict";
import { test } from "node:test";
import { CONFIG, SAMPLE_INPUTS } from "../docs/assets/config.mjs";
import { BANK, SCENARIOS, analyzeIRRBB, runScenarios, shockBps } from "../docs/assets/engine.mjs";

const close = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) < tolerance, `Expected ${actual} near ${expected}`);
};
const worst = (rows) => rows.reduce((a, b) => a.eveLossToTier1 >= b.eveLossToTier1 ? a : b);

test("CAD shock shapes respect the official short and long components", () => {
  const { shocks } = CONFIG;
  assert.equal(shockBps(shocks, "parallel_up", 10), 200);
  assert.equal(shockBps(shocks, "parallel_down", .25), -200);
  assert.equal(shockBps(shocks, "short_up", 0), 275);
  assert.equal(shockBps(shocks, "short_down", 0), -275);
  close(shockBps(shocks, "short_up", 4), 275 / Math.E);
  close(shockBps(shocks, "steepener", 0), -.65 * 275);
  close(shockBps(shocks, "flattener", 0), .80 * 275);
  close(shockBps(shocks, "steepener", 200), .90 * 175);
  close(shockBps(shocks, "flattener", 200), -.60 * 175);
});

test("shock floor is applied to post-shock rates and leaves the base curve independent", () => {
  const config = { ...CONFIG, curve: { tenors: [.25, 2, 10], rates: [.004, .006, .012] } };
  const stressed = analyzeIRRBB(config, { scenario: "parallel_down" });
  assert.ok(stressed.curve.every((point) => point.shocked >= -.0075));
  close(stressed.curve[0].shocked, -.0075);
  close(stressed.curve[0].shockBps, -115);
  assert.deepEqual(stressed.curve.map((point) => point.base), config.curve.rates);
  close(stressed.monthly[0].deltaEve, 0);
});

test("zero shock has zero change even for a hedged book with altered assumptions", () => {
  const result = analyzeIRRBB(CONFIG, {
    shockScale: 0, hedgeNotional: 17, depositBeta: .65, cpr: .17, timing: "ramp",
  });
  close(result.summary.eveStressed, result.summary.eveBase);
  close(result.summary.nii, result.summary.baseNii);
  close(result.summary.swapEve, 0);
  close(result.summary.swapDeltaNii, 0);
  assert.ok(result.monthly.every(({ deltaEve, deltaNii }) => deltaEve === 0 && deltaNii === 0));
  assert.equal(result.summary.breach, false);
});

test("instant and ramp end on the same EVE but different earnings", () => {
  const instant = analyzeIRRBB(CONFIG);
  const ramp = analyzeIRRBB(CONFIG, { timing: "ramp" });
  assert.equal(ramp.monthly.length, 13);
  assert.equal(ramp.monthly[6].shockFraction, .5);
  assert.equal(instant.monthly[1].shockFraction, 1);
  close(instant.monthly[1].deltaEve, instant.summary.deltaEve);
  close(ramp.summary.deltaEve, instant.summary.deltaEve);
  assert.notEqual(ramp.monthly[6].deltaEve, ramp.summary.deltaEve);
  assert.notEqual(ramp.summary.deltaNii, instant.summary.deltaNii);
  close(ramp.monthly.slice(1).reduce((acc, row) => acc + row.monthlyNii, 0), ramp.summary.nii);
});

test("repricing principal reconciles to the opening book and the synthetic swap legs", () => {
  const unhedged = analyzeIRRBB(CONFIG);
  const hedged = analyzeIRRBB(CONFIG, { hedgeNotional: 10 });
  for (const [result, notional] of [[unhedged, 0], [hedged, 10]]) {
    close(result.gap.reduce((sum, row) => sum + row.assets, 0), BANK.totalAssets + notional);
    close(result.gap.reduce((sum, row) => sum + row.liabilities, 0), BANK.totalLiabilities + notional);
    close(result.gap.at(-1).cumulativeGap, BANK.tier1);
  }
  close(hedged.gap[0].gap - unhedged.gap[0].gap, 10);
  close(hedged.gap[6].gap - unhedged.gap[6].gap, -10);
});

test("beta moves earnings; CPR and deposit decay change behavioral rate exposure", () => {
  const base = analyzeIRRBB(CONFIG);
  const highBeta = analyzeIRRBB(CONFIG, { depositBeta: .65 });
  assert.ok(highBeta.summary.deltaNii < base.summary.deltaNii);
  close(highBeta.summary.deltaEve, base.summary.deltaEve);
  const highCpr = analyzeIRRBB(CONFIG, { cpr: .25 });
  assert.ok(highCpr.summary.deltaEve > base.summary.deltaEve);
  assert.ok(highCpr.summary.deltaNii > base.summary.deltaNii);
  const slowerDeposits = analyzeIRRBB(CONFIG, { depositDecayYears: 6 });
  assert.ok(slowerDeposits.summary.deltaEve > base.summary.deltaEve);
  close(slowerDeposits.summary.deltaNii, base.summary.deltaNii);
});

test("six-scenario screen uses the most adverse loss and a pay-fixed hedge changes the trade-off", () => {
  const unhedged = runScenarios(CONFIG);
  const hedged = runScenarios(CONFIG, { hedgeNotional: 10 });
  assert.deepEqual(unhedged.map((row) => row.id), SCENARIOS.map(({ id }) => id));
  assert.equal(worst(unhedged).id, "parallel_up");
  assert.ok(worst(unhedged).breach);
  close(worst(unhedged).eveLossToTier1, -worst(unhedged).deltaEve / BANK.tier1);
  assert.equal(worst(hedged).id, "steepener");
  assert.ok(!worst(hedged).breach);
  assert.ok(hedged.find((row) => row.id === "parallel_down").deltaNii
    < unhedged.find((row) => row.id === "parallel_down").deltaNii);
  const sample = analyzeIRRBB(CONFIG, SAMPLE_INPUTS);
  assert.ok(sample.summary.swapEve > 0 && sample.summary.swapDeltaNii > 0);
  close(sample.summary.deltaEve, sample.monthly.at(-1).deltaEve);
});

test("out-of-range behavioral assumptions are rejected", () => {
  for (const inputs of [{ cpr: 1 }, { depositBeta: -.1 }, { hedgeNotional: Infinity }, { timing: "live" }]) {
    assert.throws(() => analyzeIRRBB(CONFIG, inputs), RangeError);
  }
});
