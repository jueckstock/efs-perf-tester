#!/usr/bin/env python3
import sys

import pandas as pd
from matplotlib import pyplot as plt

def main(argv):
    try:
        stems = argv[1:]
        assert stems != []
    except AssertionError:
        print(f"usage: {argv[0]} STATS_STEM_A STATS_STEM_B")
        return
    out_stem = f"OUT-{'-'.join(stems)}"
    
    # PLOT LOADING TIMES COMPARISON CURVES
    #-------------------------------------

    ldfs = [pd.read_csv(f"{s}-loading.csv", index_col=0) / 1_000_000 for s in stems]

    #col_pairs = list(zip(ldf1.columns, ldf2.columns))
    #assert all(a == b for a, b in col_pairs), "mismatched columns!"

    cols = ldfs[0].columns
    fig, axen = plt.subplots(len(cols), 1, figsize=(6, 4 * len(cols)), sharex=True)
    for i, c in enumerate(cols):
        tdf = pd.DataFrame({s: ldf[c] for s, ldf in zip(stems, ldfs)})
        tdf.plot.density(ax=axen[i], title=c)

    #fig, axen = plt.subplots(1, 2, sharey=True)
    #ldf1.plot.density(ax=axen[0], title=stem_a)
    #df2.plot.density(ax=axen[1], title=stem_b)
    #plt.show()
    fig.savefig(f"{out_stem}-loading.pdf")
    


if __name__ == "__main__":
    main(sys.argv)
