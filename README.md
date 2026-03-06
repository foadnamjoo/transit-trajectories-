# Transit Ops Lab

![Demo](assets/demo.gif)

Dashboard for transit operations: reliability, cost, and emissions across bus routes. Data pipeline (Python) cleans and validates raw data, computes KPIs and quality scores, forecasts ridership, and detects anomalies. The web app (D3) visualizes everything in one view.

## Quick start

```bash
make demo
```

Runs the pipeline and starts a server at http://localhost:8080. Prebuilt data in `data/serving/` is included, so the dashboard works without running the pipeline (e.g. on GitHub Pages).

## Commands

| Command | Description |
|---------|-------------|
| `make demo` | Run pipeline + start server |
| `make pipeline` | Run pipeline only |
| `make serve` | Start server (use prebuilt data) |
| `make test` | Run tests |
| `make lint` | Lint |

## Pipeline

Raw → clean → validate → metrics + quality + forecast + anomalies → `data/serving/`. See `python/` for stage scripts.

## User guide

Open **docs.html** or click "User Guide" in the dashboard header.

## Author

Foad Namjoo · [Personal Webpage](https://users.cs.utah.edu/~foad27/)
