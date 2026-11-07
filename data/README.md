# Public inputs and calibration notes

## Government of Canada zero yields

Source: Bank of Canada. [Daily zero-coupon yield curves](https://www.bankofcanada.ca/rates/interest-rates/bond-yield-curves/) · [Curve estimation methodology](https://www.bankofcanada.ca/wp-content/uploads/2010/02/wp04-48.pdf) · [Terms](https://www.bankofcanada.ca/terms/)

The project extracts 12 tenor columns (3 months through 30 years) from four dated published curves and reformats them as a JavaScript data module. The quoted decimal yields are unchanged. Each record includes its source query and the SHA-256 of the original response. The dashboard starts on October 21, 2026. March 31, 2020, December 30, 2022 and October 3, 2023 are alternative opening curves for a controlled model sensitivity. The balance sheet and behavior assumptions stay fixed across those dates. These comparisons are curve-vintage experiments rather than historical bank P&L.

The input is already a Bank of Canada fitted zero-coupon curve. The model interpolates zero rates between its knots. A second bootstrap from benchmark yields would mix zero-coupon yields with yield-to-maturity quotes. The Bank publishes fitted observations with a lag. The pinned input supports offline reproduction.

```bash
python3 scripts/refresh_data.py
```

The downloader uses `curl` to request each dated official CSV. It checks that the requested row and every selected knot exist before replacing the committed data module. A date can be supplied explicitly, with the first date used as the dashboard base.

## Synthetic bank

Two Big Five public disclosures anchor the standalone HELOC share in the retail secured sleeve. RBC’s Canadian residential mortgage balance of CAD 454.346B and Canadian HELOC balance of CAD 38.663B imply 7.84% HELOC within those categories. TD reports CAD 37.098B of non-amortizing Canadian HELOCs out of CAD 415.396B of Canadian real-estate-secured lending, or 8.93%. The model uses CAD 5B HELOC out of CAD 59B of total modeled secured retail balances, or 8.47%. These denominators follow each bank's disclosure. [RBC 2025 annual report, Table 43](https://www.rbc.com/investor-relations/_assets-custom/pdf/ar_2025_e.pdf) · [TD 2025 annual report, Table 27](https://www.td.com/content/dam/tdcom/canada/about-td/for-investors/investor-relations/financial-information/annual-report-on-form-40-f/en/e-2025-form40f.pdf)

The rest of the modeled portfolio uses rounded fictional balances, tenor distributions, contract rates, Tier 1 capital and behavioral assumptions. The CAD 100B banking book represents a stripped-down business model. The RBC and TD reports provide product-mix context for that synthetic exercise.

## Regulatory reference

The modeled profile uses the 2026 BCBS recalibration and final OSFI B-12 (2027), which takes effect November 1, 2026 for institutions with an October 31 fiscal year-end and January 1, 2027 for institutions with a December 31 fiscal year-end. CAD shocks are 200 bp parallel, 275 bp short and 175 bp long. OSFI applies a −75 bp post-shock interest-rate floor and compares the largest six-shock adverse EVE change to 15% of Tier 1 capital. [Basel SRP31](https://www.bis.org/committees/bcbs/basel-framework/standard/srp/31/inforce/2026-01-01/published/2024-07-16) · [OSFI B-12 (2027), Annex 1](https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/interest-rate-risk-management-guideline-2027)
