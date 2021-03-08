LOADING_POOL = loading_pool.csv

all : $(LOADING_POOL)

$(LOADING_POOL) : stats_results_good_urls_only.json extract_loading.py
	./extract_loading.py stats_results_good_urls_only.json >$@

clean:
	rm -f $(LOADING_POOL)