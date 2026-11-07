import { CURVE_DATA } from "./curve-data.mjs";

export const CURVE_SNAPSHOTS = CURVE_DATA.observations.map((observation) => ({
  ...observation, tenors: CURVE_DATA.tenors, source: CURVE_DATA.source,
}));

export const CONFIG = {
  curve: CURVE_SNAPSHOTS[0],
  // B-12 Annex 1 Table 1 and paragraph 12. Shock sizes in bp; floor decimal.
  shocks: { parallel: 200, short: 275, long: 175, floor: -0.0075 },
};

export const SAMPLE_INPUTS = {
  scenario: "parallel_up",
  shockScale: 1,
  cpr: 0.06,
  depositBeta: 0.55,
  depositDecayYears: 4,
  hedgeNotional: 10,
  timing: "ramp",
};
