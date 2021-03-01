#!/usr/bin/env python3
import sys

import pandas as pd
from matplotlib import pyplot as plt

def main(argv):
    try:
        stem_a = argv[1]
        stem_b = argv[2]
    except IndexError:
        print(f"usage: {argv[0]} STATS_STEM_A STATS_STEM_B")
        return
    out_stem = f"OUT-{stem_a}-{stem_b}"
    
    def csv_a(tag):
        return f"{stem_a}-{tag}.csv"

    def csv_b(tag):
        return f"{stem_b}-{tag}.csv"
    
    # PLOT LOADING TIMES COMPARISON CURVES
    #-------------------------------------

    ldf1 = pd.read_csv(csv_a('loading'), index_col=0)
    ldf2 = pd.read_csv(csv_b('loading'), index_col=0)

    col_pairs = list(zip(ldf1.columns, ldf2.columns))
    assert all(a == b for a, b in col_pairs), "mismatched columns!"

    fig, axen = plt.subplots(len(col_pairs), 1, figsize=(6, 4 * len(col_pairs)), sharex=True)
    for i, (a, _) in enumerate(col_pairs):
        tdf = pd.DataFrame({stem_a: ldf1[a], stem_b: ldf2[a]})
        tdf.plot.density(ax=axen[i], title=a, xlim=(0.5, 2.0))

    #fig, axen = plt.subplots(1, 2, sharey=True)
    #ldf1.plot.density(ax=axen[0], title=stem_a)
    #df2.plot.density(ax=axen[1], title=stem_b)
    #plt.show()
    fig.savefig(f"{out_stem}-loading.pdf")
    


if __name__ == "__main__":
    main(sys.argv)
