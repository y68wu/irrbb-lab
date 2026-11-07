/** CAD-only illustrative IRRBB engine. Monetary values are CAD billions. */
const MONTHS_PER_YEAR = 12;
const HORIZON = 12;
const RUNOFF_MONTHS = 180;
const SWAP_MONTHS = 60;
const CAPITAL_LIMIT = .15;
const COMMERCIAL_FIXED = .4;
const WHOLESALE_SHORT = .55;
const MORTGAGE_AMORTIZATION = 300;

const makeProduct = (id, label, balance, rate) => Object.freeze({ id, label, balance, rate });
const assets = Object.freeze([
  makeProduct("fixed_mortgage", "Fixed mortgages", 32, .0465),
  makeProduct("variable_mortgage", "Variable mortgages", 22, .0475),
  makeProduct("heloc", "HELOC", 5, .0555),
  makeProduct("commercial", "Commercial loans", 27, .055),
  makeProduct("goc", "GoC securities", 14, .0365),
]);
const liabilities = Object.freeze([
  makeProduct("core_deposits", "Core deposits", 31, .012),
  makeProduct("noncore_deposits", "Non-core deposits", 16, .022),
  makeProduct("gic", "GICs", 30, .0335),
  makeProduct("wholesale", "Wholesale funding", 16, .0355),
]);
const balanceSum = (sleeves) => sleeves.reduce((total, item) => total + item.balance, 0);
export const BANK = Object.freeze({
  assets, liabilities, tier1: 7, totalAssets: balanceSum(assets), totalLiabilities: balanceSum(liabilities),
  outlierLimit: CAPITAL_LIMIT,
});

export const SCENARIOS = Object.freeze([
  { id: "parallel_up", label: "Parallel up" },
  { id: "parallel_down", label: "Parallel down" },
  { id: "steepener", label: "Steepener" },
  { id: "flattener", label: "Flattener" },
  { id: "short_up", label: "Short up" },
  { id: "short_down", label: "Short down" },
].map(Object.freeze));

export const DEFAULT_INPUTS = Object.freeze({
  scenario: "parallel_up", shockScale: 1, cpr: .08, depositBeta: .40,
  depositDecayYears: 4, hedgeNotional: 0, timing: "instant",
});

const BANK_BOOK = Object.fromEntries([...assets, ...liabilities].map((product) => [product.id, product]));
const GIC_LADDER = [[12, .50], [24, .25], [36, .15], [48, .07], [60, .03]];
const SECURITIES_LADDER = [[24, .10], [72, .25], [180, .65]];
const WHOLESALE_LADDER = [[24, .55], [48, .45]];
const GAP_BUCKETS = [
  ["0–1M", 1], [">1–3M", 3], [">3–6M", 6], [">6–12M", 12],
  [">1–2Y", 24], [">2–3Y", 36], [">3–5Y", 60], [">5Y", Infinity],
];

function settings(config, inputs) {
  const { tenors, rates } = config.curve;
  if (
    tenors.length !== rates.length || tenors.length < 2 || tenors[0] <= 0
    || !tenors.every((tenor, index) => Number.isFinite(tenor) && (index === 0 || tenor > tenors[index - 1]))
    || !rates.every(Number.isFinite)
  ) throw new RangeError("Use a valid ordered zero curve.");
  const { parallel, short, long, floor } = config.shocks;
  if (![parallel, short, long].every((amplitude) => Number.isFinite(amplitude) && amplitude >= 0)
    || !Number.isFinite(floor)) throw new RangeError("Use finite nonnegative shock magnitudes and a finite floor.");
  const choice = { ...DEFAULT_INPUTS, ...inputs };
  if (!SCENARIOS.some((scenario) => scenario.id === choice.scenario)) throw new RangeError("Unknown rate shock.");
  if (!["instant", "ramp"].includes(choice.timing)) throw new RangeError("Choose an instant or ramp shock.");
  for (const [name, low, high] of [
    ["shockScale", 0, 3], ["cpr", 0, .6], ["depositBeta", 0, 1],
    ["depositDecayYears", .25, 15], ["hedgeNotional", 0, BANK.totalAssets],
  ]) {
    const value = choice[name];
    if (!Number.isFinite(value) || value < low || value > high) {
      throw new RangeError(`${name} must be between ${low} and ${high}.`);
    }
  }
  return choice;
}

function interpolate({ tenors, rates }, tenor) {
  const next = tenors.findIndex((point) => point >= tenor);
  if (next === -1) return rates.at(-1);
  if (next === 0) return rates[0];
  const previous = next - 1;
  const weight = (tenor - tenors[previous]) / (tenors[next] - tenors[previous]);
  return rates[previous] + weight * (rates[next] - rates[previous]);
}

/** Supervisory CAD curve shapes, with tenor in years and output in bp. */
export function shockBps(shocks, scenario, tenor) {
  const decay = Math.exp(-tenor / 4);
  const short = shocks.short * decay;
  const long = shocks.long * (1 - decay);
  switch (scenario) {
    case "parallel_up": return shocks.parallel;
    case "parallel_down": return -shocks.parallel;
    case "short_up": return short;
    case "short_down": return -short;
    case "steepener": return -.65 * short + .90 * long;
    case "flattener": return .80 * short - .60 * long;
    default: throw new RangeError("Unknown rate shock.");
  }
}

function rateAt(config, inputs, fraction, tenor) {
  const base = interpolate(config.curve, tenor);
  if (fraction === 0 || inputs.shockScale === 0) return base;
  const move = fraction * inputs.shockScale * shockBps(config.shocks, inputs.scenario, tenor) / 10_000;
  return Math.max(config.shocks.floor, base + move);
}

function amortizationFraction(rate, months) {
  const monthly = rate / MONTHS_PER_YEAR;
  return monthly === 0 ? 1 / months : monthly / Math.expm1(months * Math.log1p(monthly));
}

function runoff(balance, rate, monthsRemaining, smm) {
  const scheduled = balance * amortizationFraction(rate, monthsRemaining);
  return scheduled + smm * (balance - scheduled);
}

function monthlyPrepayment(cpr) {
  return -Math.expm1(Math.log1p(-cpr) / MONTHS_PER_YEAR);
}

function flowBook(inputs) {
  const result = Object.fromEntries([...assets, ...liabilities].map(({ id }) => [
    id, { principal: new Float64Array(RUNOFF_MONTHS + 1), interest: new Float64Array(RUNOFF_MONTHS + 1) },
  ]));
  function addBullet(id, balance, maturity, frequency = 1) {
    const { principal, interest } = result[id];
    principal[maturity] += balance;
    const coupon = BANK_BOOK[id].rate * balance * frequency / MONTHS_PER_YEAR;
    for (let month = frequency; month <= maturity; month += frequency) interest[month] += coupon;
  }
  function addStaggered(id, share, ladder) {
    for (const [term, weight] of ladder) {
      const amount = BANK_BOOK[id].balance * share * weight / term;
      for (let maturity = 1; maturity <= term; maturity += 1) addBullet(id, amount, maturity);
    }
  }

  // A 5Y renewal stops current fixed-coupon exposure, including the balloon.
  const mortgage = BANK_BOOK.fixed_mortgage;
  const mortgageFlow = result.fixed_mortgage;
  const smm = monthlyPrepayment(inputs.cpr);
  for (let maturity = 1; maturity <= 60; maturity += 1) {
    let balance = mortgage.balance / 60;
    for (let month = 1; month <= maturity; month += 1) {
      const principal = month === maturity
        ? balance : runoff(balance, mortgage.rate, MORTGAGE_AMORTIZATION - month + 1, smm);
      mortgageFlow.interest[month] += balance * mortgage.rate / MONTHS_PER_YEAR;
      mortgageFlow.principal[month] += principal;
      balance -= principal;
    }
  }

  for (const id of ["variable_mortgage", "heloc", "noncore_deposits"]) addBullet(id, BANK_BOOK[id].balance, 1);
  addBullet("commercial", BANK_BOOK.commercial.balance * (1 - COMMERCIAL_FIXED), 1);
  addStaggered("commercial", COMMERCIAL_FIXED, [[36, 1]]);
  for (const [months, weight] of SECURITIES_LADDER) addBullet("goc", BANK_BOOK.goc.balance * weight, months, 6);

  const deposits = BANK_BOOK.core_deposits;
  const depositFlow = result.core_deposits;
  const monthlyDecay = -Math.expm1(-1 / (MONTHS_PER_YEAR * inputs.depositDecayYears));
  let remaining = deposits.balance;
  for (let month = 1; month <= RUNOFF_MONTHS; month += 1) {
    const principal = month === RUNOFF_MONTHS ? remaining : remaining * monthlyDecay;
    depositFlow.principal[month] = principal;
    depositFlow.interest[month] = remaining * deposits.rate / MONTHS_PER_YEAR;
    remaining -= principal;
  }
  addStaggered("gic", 1, GIC_LADDER);
  addBullet("wholesale", BANK_BOOK.wholesale.balance * WHOLESALE_SHORT, 1);
  addStaggered("wholesale", 1 - WHOLESALE_SHORT, WHOLESALE_LADDER);
  return result;
}

function aggregate(book, side, interest) {
  const result = new Float64Array(RUNOFF_MONTHS + 1);
  for (const { id } of side) {
    const flow = book[id];
    for (let month = 1; month <= RUNOFF_MONTHS; month += 1) {
      result[month] += flow.principal[month] + (interest ? flow.interest[month] : 0);
    }
  }
  return result;
}

function repricingGap(book, hedgeNotional) {
  const assetFlows = aggregate(book, assets, false);
  const liabilityFlows = aggregate(book, liabilities, false);
  assetFlows[1] += hedgeNotional; // Synthetic receive-floating reset.
  liabilityFlows[SWAP_MONTHS] += hedgeNotional; // Synthetic pay-fixed principal equivalent.
  let month = 1;
  let cumulativeGap = 0;
  return GAP_BUCKETS.map(([label, last]) => {
    let repricingAssets = 0, repricingLiabilities = 0;
    for (; month <= Math.min(last, RUNOFF_MONTHS); month += 1) {
      repricingAssets += assetFlows[month];
      repricingLiabilities += liabilityFlows[month];
    }
    const gap = repricingAssets - repricingLiabilities;
    cumulativeGap += gap;
    return { label, assets: repricingAssets, liabilities: repricingLiabilities, gap, cumulativeGap };
  });
}

function discountCurve(config, inputs, fraction) {
  return Float64Array.from({ length: RUNOFF_MONTHS + 1 }, (_, month) => {
    const years = month / MONTHS_PER_YEAR;
    return Math.exp(-rateAt(config, inputs, fraction, years) * years);
  });
}

function swapAnnuity(discounts) {
  let annuity = 0;
  for (let month = 1; month <= SWAP_MONTHS; month += 1) annuity += discounts[month] / MONTHS_PER_YEAR;
  return annuity;
}

function swapPV(discounts, fixedRate, notional) {
  return notional * (1 - discounts[SWAP_MONTHS] - fixedRate * swapAnnuity(discounts));
}

function equityValue(assetFlows, liabilityFlows, discounts, fixedRate, notional) {
  let assetPV = 0, liabilityPV = 0;
  for (let month = 1; month <= RUNOFF_MONTHS; month += 1) {
    assetPV += assetFlows[month] * discounts[month];
    liabilityPV += liabilityFlows[month] * discounts[month];
  }
  const swap = swapPV(discounts, fixedRate, notional);
  return { value: assetPV - liabilityPV + swap, swap };
}

function makeCohorts(id, share, ladder, stagger = true) {
  const product = BANK_BOOK[id];
  return ladder.flatMap(([term, weight]) => {
    const count = stagger ? term : 1;
    return Array.from({ length: count }, (_, index) => ({
      amount: product.balance * share * weight / count,
      maturity: stagger ? index + 1 : term,
      rate: product.rate,
      amortization: MORTGAGE_AMORTIZATION,
    }));
  });
}

function fixedMonth(cohorts, month, replacementTenor, replacementRate, smm = null) {
  let interest = 0, replacement = 0;
  for (const item of cohorts) {
    interest += item.amount * item.rate / MONTHS_PER_YEAR;
    if (item.maturity === month) {
      replacement += item.amount;
      item.amount = 0;
    } else if (smm !== null) {
      const principal = runoff(item.amount, item.rate, item.amortization, smm);
      item.amount -= principal;
      item.amortization -= 1;
      replacement += principal;
    }
  }
  if (replacement > 0) cohorts.push({
    amount: replacement, maturity: month + replacementTenor, rate: replacementRate,
    amortization: MORTGAGE_AMORTIZATION,
  });
  return interest;
}

function projectEarnings(config, inputs, fixedRate, fractions) {
  const mortgage = makeCohorts("fixed_mortgage", 1, [[60, 1]]);
  const commercial = makeCohorts("commercial", COMMERCIAL_FIXED, [[36, 1]]);
  const gic = makeCohorts("gic", 1, GIC_LADDER);
  const wholesale = makeCohorts("wholesale", 1 - WHOLESALE_SHORT, WHOLESALE_LADDER);
  const securities = makeCohorts("goc", 1, SECURITIES_LADDER, false);
  const smm = monthlyPrepayment(inputs.cpr);
  const projected = [{ total: 0, swap: 0, currentNii: 0 }];
  for (let month = 1; month <= HORIZON; month += 1) {
    const rateMove = (years) => rateAt(config, inputs, fractions[month], years) - interpolate(config.curve, years);
    const shortMove = rateMove(1 / MONTHS_PER_YEAR);
    const productRate = (id, move) => Math.max(0, BANK_BOOK[id].rate + move);
    const floatIncome = (id, exposure, move) => (
      BANK_BOOK[id].balance * exposure * productRate(id, move) / MONTHS_PER_YEAR
    );
    const assetIncome = fixedMonth(mortgage, month, 60, productRate("fixed_mortgage", rateMove(5)), smm)
      + floatIncome("variable_mortgage", 1, shortMove)
      + floatIncome("heloc", 1, shortMove)
      + floatIncome("commercial", 1 - COMMERCIAL_FIXED, shortMove)
      + fixedMonth(commercial, month, 36, productRate("commercial", rateMove(3)))
      + fixedMonth(securities, month, 72, productRate("goc", rateMove(6)));
    const fundingCost = floatIncome("core_deposits", 1, inputs.depositBeta * shortMove)
      + floatIncome("noncore_deposits", 1, Math.min(1, inputs.depositBeta * 1.5) * shortMove)
      + fixedMonth(gic, month, 36, productRate("gic", rateMove(3)))
      + floatIncome("wholesale", WHOLESALE_SHORT, shortMove)
      + fixedMonth(wholesale, month, 36, productRate("wholesale", rateMove(3)));
    const forward = Math.expm1(rateAt(config, inputs, fractions[month], 1 / MONTHS_PER_YEAR) / MONTHS_PER_YEAR)
      * MONTHS_PER_YEAR;
    const swapIncome = inputs.hedgeNotional * (forward - fixedRate) / MONTHS_PER_YEAR;
    const currentNii = assetIncome - fundingCost + swapIncome;
    const previous = projected.at(-1);
    projected.push({ total: previous.total + currentNii, swap: previous.swap + swapIncome, currentNii });
  }
  return projected;
}

export function analyzeIRRBB(config, inputs = {}) {
  const choice = settings(config, inputs);
  const book = flowBook(choice);
  const assetFlows = aggregate(book, assets, true);
  const liabilityFlows = aggregate(book, liabilities, true);
  const baseDiscounts = discountCurve(config, choice, 0);
  const fixedRate = (1 - baseDiscounts[SWAP_MONTHS]) / swapAnnuity(baseDiscounts);
  const base = equityValue(assetFlows, liabilityFlows, baseDiscounts, fixedRate, choice.hedgeNotional);
  const fractions = Array.from({ length: HORIZON + 1 }, (_, month) => (
    choice.timing === "instant" ? Number(month > 0) : month / HORIZON
  ));
  const baseNii = projectEarnings(config, choice, fixedRate, fractions.map(() => 0));
  const shockedNii = projectEarnings(config, choice, fixedRate, fractions);
  const stressedDiscounts = discountCurve(config, choice, 1);
  const stressed = equityValue(assetFlows, liabilityFlows, stressedDiscounts, fixedRate, choice.hedgeNotional);
  const monthly = fractions.map((shockFraction, month) => {
    // Revalue the opening run-off book at each phased curve. The EVE series
    // does not roll the balance sheet or add the separate NII cash flows.
    const value = shockFraction === 0 ? base : shockFraction === 1 ? stressed : equityValue(
      assetFlows, liabilityFlows, discountCurve(config, choice, shockFraction), fixedRate, choice.hedgeNotional,
    );
    return {
      month, shockFraction, deltaEve: value.value - base.value,
      deltaNii: shockedNii[month].total - baseNii[month].total,
      nii: shockedNii[month].total, baseNii: baseNii[month].total,
      monthlyNii: shockedNii[month].currentNii, monthlyBaseNii: baseNii[month].currentNii,
    };
  });
  const final = monthly.at(-1);
  const eveLossToTier1 = Math.max(0, -final.deltaEve) / BANK.tier1;
  return {
    inputs: choice,
    summary: {
      eveBase: base.value, eveStressed: stressed.value, deltaEve: final.deltaEve,
      baseNii: final.baseNii, nii: final.nii, deltaNii: final.deltaNii,
      eveLossToTier1, breach: eveLossToTier1 > CAPITAL_LIMIT,
      swapEve: stressed.swap - base.swap, swapDeltaNii: shockedNii.at(-1).swap - baseNii.at(-1).swap,
      swapFixedRate: fixedRate,
    },
    monthly,
    gap: repricingGap(book, choice.hedgeNotional),
    curve: config.curve.tenors.map((tenor) => {
      const baseRate = interpolate(config.curve, tenor);
      const shocked = rateAt(config, choice, 1, tenor);
      return { tenor, base: baseRate, shocked, shockBps: (shocked - baseRate) * 10_000 };
    }),
  };
}

export function runScenarios(config, inputs = {}) {
  return SCENARIOS.map(({ id, label }) => ({
    id, label, ...analyzeIRRBB(config, { ...inputs, scenario: id }).summary,
  }));
}
