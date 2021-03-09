#!/usr/bin/env python3
import csv
import json
import sys
from collections import defaultdict


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
            visit_url = visit_record["url"]
            policy_name = visit_record["policy"]
            policy_list = per_policy[policy_name]
            for ckey, cycle in visit_record["visits"].items():
                try:
                    loading_stats = {label: data["loading"] for label, data in cycle["stats"].items()}
                    loading_stats["url"] = visit_url
                    policy_list.append(loading_stats)
                except KeyError as err:
                    print(f"record[{i}], policy[{policy_name}], cycle[{ckey}] malformed, missing key {err}", file=sys.stderr)
                    json.dump(cycle, sys.stderr, indent=2)
                    print(file=sys.stderr)
        except KeyError as err:
            print(f"record[{i}], policy[{policy_name}] malformed, missing key {err}", file=sys.stderr)
            json.dump(visit_record, sys.stderr, indent=2)
            print(file=sys.stderr)
    
    writer = csv.writer(sys.stdout)
    writer.writerow(['url', 'metric', 'policy', 'temp', 'seconds'])
    for policy_name, stats_list in per_policy.items():
        for cycle in stats_list:
            visit_url = cycle["url"]
            for metric, diff_value in cycle["diff"].items():
                writer.writerows([
                    [visit_url, metric, policy_name, 'cold', cycle["cold"][metric] / 1_000_000],
                    [visit_url, metric, policy_name, 'hot', cycle["hot"][metric] / 1_000_000],
                ])



if __name__ == "__main__":
    main(sys.argv)