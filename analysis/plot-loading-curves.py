#!/usr/bin/env python3
import os
import sys

import pandas as pd
import seaborn as sns
from matplotlib import pyplot as plt

PYPLOT_STYLE = os.environ.get("PYPLOT_STYLE", "tableau-colorblind10")


def main(argv):
    try:
        loading_csv_file = argv[1]
    except IndexError:
        print(f"usage: {argv[0]} LOADING_TIMES_CSV_FILE [OUTPUT_PREFIX]")
        return
    
    if len(argv) > 2:
        out_prefix = argv[2]
    else:
        out_prefix = "./loading-"
    
    plt.style.use(PYPLOT_STYLE)
    COLORS = plt.rcParams['axes.prop_cycle'].by_key()['color']
    policy_styles = {
        'vanilla': ('Permissive', COLORS[0], '+'),
        'page-length': ('Page-length', COLORS[1], '^'),
        'split-key': ('Site-keyed', COLORS[2], 'o'),
        'block3p': ('Blocking', COLORS[3], 'x'),
    }
    temp_line_styles = {
        'cold': ("cold", '-'),
        'hot': ("hot", ':'),
    }

    df = pd.read_csv(loading_csv_file)

    for metric, mdata in df.groupby('metric'):
        ax = None
        series_map = {series: sdata.seconds for series, sdata in mdata.groupby(['policy', 'temp'])}
        max_x = 0.0
        for policy, (ptext, pcolor, pmarker) in policy_styles.items():
            for temp, (ttext, tls) in temp_line_styles.items():
                series = series_map[(policy, temp)]
                ax = sns.ecdfplot(series, label=f"{ptext} ({ttext})", color=pcolor, marker=pmarker, ls=tls, markevery=500, alpha=0.5, ax=ax)
                max_x = max(max_x, series.quantile(0.95))
        
        ax.legend()
        ax.set_xlabel(f"seconds until {metric}")
        ax.set_ylabel("CDF")
        ax.set_title(metric)
        ax.set_xlim((0, max_x))
        fig = ax.get_figure()
        fig.tight_layout()
        fig.savefig(f"{out_prefix}{metric}.pdf")
        plt.close(fig)


if __name__ == "__main__":
    main(sys.argv)
