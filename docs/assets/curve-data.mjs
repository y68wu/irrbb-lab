// Bank of Canada data. Selected tenor columns; continuously compounded decimal yields.
export const CURVE_DATA = {
  "source": "https://www.bankofcanada.ca/rates/interest-rates/bond-yield-curves/",
  "terms": "https://www.bankofcanada.ca/terms/",
  "tenors": [
    0.25,
    0.5,
    1,
    2,
    3,
    4,
    5,
    7,
    10,
    15,
    20,
    30
  ],
  "observations": [
    {
      "asOf": "2026-10-21",
      "rates": [
        0.0250793,
        0.0270168,
        0.0297441,
        0.0333438,
        0.0347815,
        0.0355124,
        0.0360447,
        0.0372388,
        0.0391486,
        0.0406974,
        0.041294,
        0.0423206
      ],
      "downloadUrl": "https://www.bankofcanada.ca/stats/results/csv?lookupPage=lookup_yield_curve.php&startRange=1986-01-01&searchRange=&dFrom=2026-10-21&dTo=2026-10-21",
      "responseSha256": "2c89f0f4794219d87b9b97f1fa7e12ac2b2383e70e8b7516af039dfece1c3ec3"
    },
    {
      "asOf": "2020-03-31",
      "rates": [
        0.0025384,
        0.00309,
        0.0036956,
        0.0045187,
        0.0053186,
        0.0058759,
        0.0061214,
        0.0064105,
        0.0078421,
        0.0114383,
        0.0134853,
        0.0136639
      ],
      "downloadUrl": "https://www.bankofcanada.ca/stats/results/csv?lookupPage=lookup_yield_curve.php&startRange=1986-01-01&searchRange=&dFrom=2020-03-31&dTo=2020-03-31",
      "responseSha256": "ce14969263ccfc4409da79564cc87627c5a54dc886ad7338d1b74a16b274c0c9"
    },
    {
      "asOf": "2022-12-30",
      "rates": [
        0.042991,
        0.0453389,
        0.0472193,
        0.0396168,
        0.0364357,
        0.034305,
        0.0330797,
        0.0323595,
        0.0328743,
        0.0334694,
        0.0332207,
        0.0323466
      ],
      "downloadUrl": "https://www.bankofcanada.ca/stats/results/csv?lookupPage=lookup_yield_curve.php&startRange=1986-01-01&searchRange=&dFrom=2022-12-30&dTo=2022-12-30",
      "responseSha256": "f412292eaf36aa7326abd76a60a931e9562fa8b0a091522faad33406989a55f4"
    },
    {
      "asOf": "2023-10-03",
      "rates": [
        0.0516857,
        0.0531224,
        0.0547652,
        0.0484965,
        0.0458792,
        0.0441552,
        0.0431469,
        0.0423852,
        0.0422321,
        0.0416558,
        0.0406867,
        0.0393059
      ],
      "downloadUrl": "https://www.bankofcanada.ca/stats/results/csv?lookupPage=lookup_yield_curve.php&startRange=1986-01-01&searchRange=&dFrom=2023-10-03&dTo=2023-10-03",
      "responseSha256": "f24bf8ec2695ca67cde6a893f870151ee1f0ba50c16872cee19510758b8b8d93"
    }
  ]
};
