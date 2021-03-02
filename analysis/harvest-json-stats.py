#!/usr/bin/env python3
import sys
import json

import pandas as pd


def main(argv):
    try:
        stats_stem = argv[1]
    except IndexError:
        print(f"usage: {argv[0]} OUT_CSV_FILE_STEM <STREAM-OF-STATS-JSON-FILENAMES")
        return
    
    def csv_name(tag):
        return f"{stats_stem}-{tag}.csv"
    
    loading_stats = []
    v8_stats = []
    req_stats = []
    for stats_sile in map(str.strip, sys.stdin):
        with open(stats_sile, 'rb') as fd:
            raw_stats = json.load(fd)
        
        ratio_stats = raw_stats['diff']
        loading_stats.append(ratio_stats['loading'])
        for key, stats in ratio_stats['v8'].items():
            v8_stats.append(dict(origin=key, **stats))
        for key, stats in ratio_stats['req'].items():
            req_stats.append(dict(origin=key, **stats))
    
    ldf = pd.DataFrame(loading_stats)
    ldf.to_csv(csv_name('loading'), index_label=False)

    vdf = pd.DataFrame(v8_stats)
    vdf.to_csv(csv_name('v8'), index_label=False)

    rdf = pd.DataFrame(req_stats)
    rdf.to_csv(csv_name('req'), index_label=False)


if __name__ == "__main__":
    main(sys.argv)
