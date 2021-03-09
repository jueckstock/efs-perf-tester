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
                        for raw_origin_url, stats in data["req"].items():
                            try:
                                origin_url = urlparse(raw_origin_url)
                            except ValueError as ux:
                                print(f"unparseable execution context URL: '{raw_origin_url}': {ux}", file=sys.stderr)
                                continue
                            # 3p only!
                            origin_etld1 = get_sld(origin_url.hostname)
                            if (origin_etld1 is not None) and (origin_etld1 != visit_etld1):
                                labeled_list[origin_etld1] = stats
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
    writer.writerow(['tpetld1', 'policy', 'temp', 'requests', 'bytes'])
    for policy_name, stats_list in per_policy.items():
        for cycle in stats_list:
            for tpetld1 in cycle["diff"]:
                writer.writerows([
                    [tpetld1, policy_name, 'cold', cycle["cold"][tpetld1]["count"], cycle["cold"][tpetld1]["bytes"]],
                    [tpetld1, policy_name, 'hot', cycle["hot"][tpetld1]["count"], cycle["hot"][tpetld1]["bytes"]],
                ])



if __name__ == "__main__":
    main(sys.argv)