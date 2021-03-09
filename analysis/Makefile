LOADING_PDFS = \
	loading-domContentLoadedEventEnd.pdf \
	loading-firstContentfulPaint.pdf \
	loading-largestContentfulPaint.pdf \
	loading-domInteractive.pdf \
	loading-firstPaint.pdf \
	loading-loadEventEnd.pdf

V8_PDFS = \
	v8-microseconds.pdf

all: loading v8

loading: $(LOADING_PDFS)

v8: $(V8_PDFS)

$(LOADING_PDFS) : ../experiments/loading_pool.csv plot-loading-curves.py
	.venv/bin/python3 plot-loading-curves.py ../experiments/loading_pool.csv ./loading-

$(V8_PDFS) : ../experiments/v8_pool.csv plot-v8-curves.py
	.venv/bin/python3 plot-v8-curves.py ../experiments/v8_pool.csv ./v8-

clean:
	rm -f $(LOADING_PDFS) $(V8_PDFS)
