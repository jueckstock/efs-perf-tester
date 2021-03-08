#!/usr/bin/env python3
import csv
import json
import sys
from collections import defaultdict
from urllib.parse import urlparse

from publicsuffix2 import get_sld


def main(argv):
    try:
        json_file = argv[1]
    except IndexError:
        print(f"usage: {argv[0]} JSON_STATS_DUMP")
        return
    
    with open(json_file, 'rb') as fd:
        stats_dump = json.load(fd)
    
    per_policy = defaultdict(list)
    for i, visit_record in enumerate(stats_dump):
        try:
            visit_url = urlparse(visit_record["url"])
            visit_etld1 = get_sld(visit_url.hostname)

            policy_name = visit_record["policy"]
            policy_list = per_policy[policy_name]
            for ckey, cycle in visit_record["visits"].items():
                try:
                    labeled_stats = {}
                    for label, data in cycle["stats"].items():
                        labeled_list = {}
                        for raw_exe_url, stats in data["v8"].items():
                            try:
                                exe_url = urlparse(raw_exe_url)
                            except ValueError as ux:
                                print(f"unparseable execution context URL: '{raw_exe_url}': {ux}", file=sys.stderr)
                                continue
                            # 3p only!
                            exe_etld1 = get_sld(exe_url.hostname)
                            if (exe_etld1 is not None) and (exe_etld1 != visit_etld1):
                                labeled_list[exe_etld1] = stats
                        if labeled_list:
                            labeled_stats[label] = labeled_list
                    if 'diff' in labeled_stats:
                        policy_list.append(labeled_stats)
                except KeyError as err:
                    print(f"record[{i}], policy[{policy_name}], cycle[{ckey}] malformed, missing key {err}", file=sys.stderr)
                    json.dump(cycle, sys.stderr, indent=2)
                    print(file=sys.stderr)
        except KeyError as err:
            print(f"record[{i}], policy[{policy_name}] malformed, missing key {err}", file=sys.stderr)
            json.dump(visit_record, sys.stderr, indent=2)
            print(file=sys.stderr)
    
    #return per_policy

    writer = csv.writer(sys.stdout)
    writer.writerow(['tpetld1', 'policy', 'temp', 'invokations', 'microseconds'])
    for policy_name, stats_list in per_policy.items():
        for cycle in stats_list:
            for tpetld1 in cycle["diff"]:
                writer.writerows([
                    [tpetld1, policy_name, 'cold', cycle["cold"][tpetld1]["count"], cycle["cold"][tpetld1]["microseconds"]],
                    [tpetld1, policy_name, 'hot', cycle["hot"][tpetld1]["count"], cycle["hot"][tpetld1]["microseconds"]],
                ])



if __name__ == "__main__":
    main(sys.argv)