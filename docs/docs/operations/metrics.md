# Metrics & logs

The backend exposes Prometheus-format metrics at `GET /metrics` and
emits one JSON line per request to stdout.

## Logs

Format: one JSON object per line, fields below. `LOG_FORMAT=pretty`
prints a human-friendly form for local dev; `LOG_FORMAT=json`
(default in `NODE_ENV=production`) is what shippers expect.

| Field | Type | Example |
|---|---|---|
| `ts` | ISO-8601 string | `2026-05-23T04:15:00.123Z` |
| `level` | enum | `trace`, `debug`, `info`, `warn`, `error` |
| `msg` | string | `request`, `challenge loaded`, `webhook solve.first: HTTP 200` |
| `method` | string (request) | `GET`, `POST` |
| `path` | string (request) | `/api/status/ch01?address=0xAbC1...3456` |
| `status` | integer (request) | `200`, `429`, `502` |
| `latency_ms` | number (request) | `12.4` |
| `ip` | string (request) | `203.0.113.42` |
| `req_id` | string (request) | `9b1c5fa1e2` — also echoed in `X-Request-Id` |

The `?address=` query is truncated to `0xAbC1...3456` in log paths so
wallet addresses don't proliferate in your log indexer. Players still
see the full URL; the truncation is purely cosmetic on the log side.

`LOG_LEVEL` filters: `trace` shows everything, `error` shows only 5xx
and explicit errors.

`X-Request-Id` is exposed on every response. Players can quote it when
reporting an issue; you grep your log shipper for the same string.

## Default metric series

## Default series

| Name | Type | Labels | Meaning |
|---|---|---|---|
| `ctf_uptime_seconds` | gauge | — | Seconds since process start. |
| `ctf_challenges_total` | gauge | `mode` | Configured challenges, grouped by mode. |
| `ctf_instances_active` | gauge | `challenge` | Currently-running private-anvil instances. |
| `ctf_tracked_players` | gauge | — | Players currently in the solve tracker. |
| `ctf_solves_first_total` | counter | `challenge` | First-time `isSolved` transitions. |
| `ctf_solve_flips_total` | counter | `challenge`, `direction` | Subsequent state changes (`up` / `down`). |
| `ctf_launches_total` | counter | `challenge` | Successful private-anvil spawns. |
| `ctf_launches_failed_total` | counter | `challenge`, `reason` | Failed spawns (`docker_run`, `anvil_timeout`, `port_exhausted`, `no_docker`, `other`). |
| `ctf_webhook_fired_total` | counter | `event` | Outbound webhook attempts. |
| `ctf_webhook_failed_total` | counter | `event` | Outbound webhook failures. |
| `ctf_api_requests_total` | counter | `endpoint`, `status` | Reserved — populate via custom middleware if needed. |

The endpoint is intentionally unauthenticated — restrict via firewall
or nginx if you don't want it world-readable.

## Sample scrape config

```yaml
# prometheus.yml
scrape_configs:
  - job_name: ctf-backend
    metrics_path: /metrics
    static_configs:
      - targets: ["ctf-backend:8787"]
```

In docker-compose, run Prometheus on the same `internal` network so it
can reach `backend:8787` directly without going through nginx.

## Useful dashboards

A minimal Grafana row:

| Panel | PromQL |
|---|---|
| Active instances | `sum(ctf_instances_active)` |
| Solves / hour by challenge | `rate(ctf_solves_first_total[1h]) * 3600` |
| Launch failure ratio | `sum(rate(ctf_launches_failed_total[5m])) / sum(rate(ctf_launches_total[5m]) + rate(ctf_launches_failed_total[5m]))` |
| Webhook error rate | `rate(ctf_webhook_failed_total[5m])` |
| KOTH dethrones / min | `sum(rate(ctf_solve_flips_total{direction="down"}[1m]))` |

## Alerts worth setting

```yaml
groups:
  - name: ctf
    rules:
      - alert: BackendDown
        expr: up{job="ctf-backend"} == 0
        for: 1m

      - alert: LaunchFailureSpike
        expr: increase(ctf_launches_failed_total[5m]) > 10
        for: 5m

      - alert: PortPoolExhausted
        expr: increase(ctf_launches_failed_total{reason="port_exhausted"}[5m]) > 0

      - alert: WebhookFailing
        expr: rate(ctf_webhook_failed_total[5m]) > 0.1
        for: 5m
```

## Why no per-endpoint latency?

`express-rate-limit`'s headers + Cloudflare's edge metrics cover most
of what an operator wants for free. If you genuinely need server-side
latency histograms, swap in `prom-client` and add `koa-prom-client` /
`express-prom-bundle`-style middleware — the metrics registry in
`backend/metrics.js` was deliberately kept minimal so it's drop-in
replaceable.
