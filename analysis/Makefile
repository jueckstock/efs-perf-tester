LOADING_PDFS = \
	loading-domContentLoadedEventEnd.pdf \
	loading-firstContentfulPaint.pdf \
	loading-largestContentfulPaint.pdf \
	loading-domInteractive.pdf \
	loading-firstPaint.pdf \
	loading-loadEventEnd.pdf

all: loading

loading: $(LOADING_PDFS)

$(LOADING_PDFS) : ../experiments/loading_pool.csv plot-loading-curves.py
	.venv/bin/python3 plot-loading-curves.py ../experiments/loading_pool.csv ./loading-

clean:
	rm -f $(LOADING_PDFS)
