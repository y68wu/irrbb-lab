"""Render the overview figure from the committed model outputs."""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

root = Path(__file__).resolve().parents[1]
paths = pd.read_csv(root / "reports/sample_path.csv")
reference = pd.read_csv(root / "reports/scenarios_unhedged.csv")
hedged = pd.read_csv(root / "reports/scenarios_hedged.csv")
colours = {"instant": "#8776d0", "ramp": "#2f786f"}
ink, muted, grid = "#182436", "#54617b", "#e1e5ed"
with plt.rc_context({
    "font.family": "DejaVu Sans", "font.size": 10, "text.color": ink,
    "axes.labelcolor": muted, "xtick.color": muted, "ytick.color": muted,
    "axes.spines.top": False, "axes.spines.right": False, "axes.spines.left": False,
    "axes.spines.bottom": False, "xtick.major.size": 0, "ytick.major.size": 0,
    "axes.axisbelow": True,
}):
    fig, (left, right) = plt.subplots(1, 2, figsize=(11.6, 4.4))
    fig.subplots_adjust(left=.096, right=.982, top=.73, bottom=.20, wspace=.33)
    fig.text(.096, .91, "One rate shock, two risk measures", size=22, weight="bold")
    fig.text(.096, .83, "Canadian dollar banking book  /  economic value and one-year earnings", color=muted)
    for timing, path in paths.groupby("timing", sort=False):
        left.plot(path.month, path.deltaNii * 1000, color=colours[timing], lw=2.6, label=timing.title())
    left.axhline(0, color=muted, lw=.8)
    left.set_title("Sample · cumulative ΔNII", loc="left", weight="bold", pad=10)
    left.set_ylabel("CAD millions")
    left.set_xlabel("Simulated month")
    left.set_xticks([0, 3, 6, 9, 12])
    left.legend(frameon=False, loc="lower center", bbox_to_anchor=(.5, -.34), ncol=2)
    left.grid(axis="y", color=grid)

    label = ["Parallel up", "Parallel down", "Steepener", "Flattener", "Short up", "Short down"]
    index = list(range(len(reference)))
    right.barh([i + .18 for i in index], -reference.deltaEve * 1000, height=.33,
               color="#aab4d8", label="No swap")
    right.barh([i - .18 for i in index], -hedged.deltaEve * 1000, height=.33,
               color="#514594", label="With pay-fixed swap")
    right.axvline(1050, color="#a64b3d", lw=1.1, ls="--", label="15% of Tier 1")
    right.axvline(0, color=muted, lw=.8)
    right.set_yticks(index, label)
    right.invert_yaxis()
    right.set_title("Six prescribed shocks · EVE loss", loc="left", weight="bold", pad=10)
    right.set_xlabel("CAD millions  /  gains are negative")
    right.grid(axis="x", color=grid)
    right.legend(frameon=False, loc="lower center", bbox_to_anchor=(.5, -.34), ncol=3, fontsize=8)
    fig.savefig(root / "figures/irrbb-tradeoff.png", facecolor="#fff", dpi=160)
