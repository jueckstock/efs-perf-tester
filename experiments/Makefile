LOADING_POOL = loading_pool.csv
V8_POOL = v8_pool.csv
REQ_POOL = req_pool.csv

all : $(LOADING_POOL) $(V8_POOL) $(REQ_POOL)

$(LOADING_POOL) : stats_results_good_urls_only.json extract_loading.py
	.venv/bin/python3 ./extract_loading.py stats_results_good_urls_only.json >$@

$(V8_POOL) : stats_results_good_urls_only.json extract_v8.py
	.venv/bin/python3 ./extract_v8.py stats_results_good_urls_only.json >$@

$(REQ_POOL) : stats_results_good_urls_only.json extract_req.py
	.venv/bin/python3 ./extract_req.py stats_results_good_urls_only.json >$@

clean:
	rm -f $(LOADING_POOL) $(V8_POOL) $(REQ_POOL)