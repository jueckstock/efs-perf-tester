#!/usr/bin/env python3
import os
import sys

import pandas as pd
import seaborn as sns
from matplotlib import pyplot as plt

PYPLOT_STYLE = os.environ.get("PYPLOT_STYLE", "tableau-colorblind10")


def main(argv):
    try:
        v8_csv_file = argv[1]
    except IndexError:
        print(f"usage: {argv[0]} V8_TIMES_CSV_FILE [OUTPUT_PREFIX]")
        return
    
    if len(argv) > 2:
        out_prefix = argv[2]
    else:
        out_prefix = "./req-"
    
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

    metrics = {
        'requests': ('3rd Party HTTP[S] Requests', 'requests', (0, 20), 5000),
        'bytes': ('3rd Party HTTP[S] Request Volume', 'bytes', (0, 1e5), 5000),
    }

    df = pd.read_csv(v8_csv_file)

    for metric, (title_text, xlabel_text, plot_xlims, marker_stride) in metrics.items():
        ax = None
        series_map = {series: sdata.reset_index()[metric] for series, sdata in df.groupby(['policy', 'temp'])}
        max_x = 0.0
        for policy, (ptext, pcolor, pmarker) in policy_styles.items():
            for temp, (ttext, tls) in temp_line_styles.items():
                series = series_map[(policy, temp)]
                ax = sns.ecdfplot(series, label=f"{ptext} ({ttext})", color=pcolor, marker=pmarker, ls=tls, markevery=marker_stride, ax=ax, alpha=0.5)
                max_x = max(max_x, series.quantile(0.95))
        
        ax.legend()
        ax.set_xlabel(xlabel_text)
        ax.set_ylabel("3rd party domains (CDF)")
        ax.set_title(title_text)
        ax.set_xlim((0, max_x))
        fig = ax.get_figure()
        fig.tight_layout()
        fig.savefig(f"{out_prefix}{metric}.pdf")
        plt.close(fig)


if __name__ == "__main__":
    main(sys.argv)
