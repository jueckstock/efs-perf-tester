LOADING_PDFS = \
	loading-domContentLoadedEventEnd.pdf \
	loading-firstContentfulPaint.pdf \
	loading-largestContentfulPaint.pdf \
	loading-domInteractive.pdf \
	loading-firstPaint.pdf \
	loading-loadEventEnd.pdf

V8_PDFS = \
	v8-invocations.pdf \
	v8-microseconds.pdf

REQ_PDFS = \
	req-requests.pdf \
	req-bytes.pdf

all: loading v8 req

loading: $(LOADING_PDFS)

v8: $(V8_PDFS)

req: $(REQ_PDFS)

$(LOADING_PDFS) : ../experiments/loading_pool.csv plot-loading-curves.py
	.venv/bin/python3 plot-loading-curves.py ../experiments/loading_pool.csv ./loading-

$(V8_PDFS) : ../experiments/v8_pool.csv plot-v8-curves.py
	.venv/bin/python3 plot-v8-curves.py ../experiments/v8_pool.csv ./v8-

$(REQ_PDFS) : ../experiments/req_pool.csv plot-req-curves.py
	.venv/bin/python3 plot-req-curves.py ../experiments/req_pool.csv ./req-


clean:
	rm -f $(LOADING_PDFS) $(V8_PDFS) $(REQ_PDFS)
