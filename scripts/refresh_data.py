"""Download selected published Bank of Canada zero-curve observations."""
from __future__ import annotations

import argparse
import csv
from datetime import date
from hashlib import sha256
from io import StringIO
import json
import math
from pathlib import Path
from subprocess import check_output
from urllib.parse import urlencode

BASE_URL = "https://www.bankofcanada.ca/stats/results/csv"
SOURCE = "https://www.bankofcanada.ca/rates/interest-rates/bond-yield-curves/"
TENORS = (0.25, 0.5, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30)
DATES = ("2026-10-21", "2020-03-31", "2022-12-30", "2023-10-03")
ROOT = Path(__file__).resolve().parents[1]


def parse_curve(raw: bytes, as_of: str) -> list[float]:
    rows = csv.DictReader(StringIO(raw.decode("utf-8-sig")), skipinitialspace=True)
    matches = [row for row in rows if row["Date"].strip() == as_of]
    if len(matches) != 1:
        raise ValueError(f"Expected one published curve for {as_of}, got {len(matches)}")
    rates = [float(matches[0][f"ZC{round(tenor * 100):03d}YR"]) for tenor in TENORS]
    if not all(map(math.isfinite, rates)):
        raise ValueError(f"Invalid zero rate in {as_of}")
    return rates


def fetch(as_of: str) -> dict:
    date.fromisoformat(as_of)
    url = BASE_URL + "?" + urlencode({
        "lookupPage": "lookup_yield_curve.php",
        "startRange": "1986-01-01",
        "searchRange": "",
        "dFrom": as_of,
        "dTo": as_of,
    })
    raw = check_output(["curl", "--fail", "--silent", "--show-error", "--location",
                        "--max-time", "30", url])
    return {
        "asOf": as_of,
        "rates": parse_curve(raw, as_of),
        "downloadUrl": url,
        "responseSha256": sha256(raw).hexdigest(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dates", nargs="*", default=DATES, help="ISO dates, first is the site base date")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/assets/curve-data.mjs")
    args = parser.parse_args()
    data = {
        "source": SOURCE,
        "terms": "https://www.bankofcanada.ca/terms/",
        "tenors": TENORS,
        "observations": [fetch(as_of) for as_of in args.dates],
    }
    args.output.write_text(
        "// Bank of Canada data. Selected tenor columns; continuously compounded decimal yields.\n"
        "export const CURVE_DATA = " + json.dumps(data, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Saved {len(data['observations'])} zero curves to {args.output}")


if __name__ == "__main__":
    main()
