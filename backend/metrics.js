const startedAt = Math.floor(Date.now() / 1000);

class Metric {
  constructor(name, help, type) {
    this.name = name;
    this.help = help;
    this.type = type;
    this.values = new Map();
  }
  _key(labels) {
    const entries = Object.entries(labels ?? {}).sort();
    return entries.map(([k, v]) => `${k}=${v}`).join(",");
  }
  inc(labels = {}, amount = 1) {
    const k = this._key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + amount);
  }
  set(labels = {}, value) {
    this.values.set(this._key(labels), value);
  }
  reset(labels = {}) {
    this.values.delete(this._key(labels));
  }
  render() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} ${this.type}`];
    for (const [key, val] of this.values) {
      const labels = key
        ? "{" + key.split(",").map(p => {
            const [k, v] = p.split("=");
            return `${k}="${String(v).replace(/"/g, '\\"')}"`;
          }).join(",") + "}"
        : "";
      lines.push(`${this.name}${labels} ${val}`);
    }
    return lines.join("\n");
  }
}

class Registry {
  constructor() {
    this.metrics = new Map();
    this.callbacks = [];
  }
  counter(name, help) {
    let m = this.metrics.get(name);
    if (!m) { m = new Metric(name, help, "counter"); this.metrics.set(name, m); }
    return m;
  }
  gauge(name, help) {
    let m = this.metrics.get(name);
    if (!m) { m = new Metric(name, help, "gauge"); this.metrics.set(name, m); }
    return m;
  }
  onScrape(fn) {
    this.callbacks.push(fn);
  }
  render() {
    for (const cb of this.callbacks) {
      try { cb(this); } catch {}
    }
    return [...this.metrics.values()].map(m => m.render()).join("\n\n") + "\n";
  }
}

export const metrics = new Registry();

metrics.gauge("ctf_uptime_seconds", "seconds since backend start");
metrics.onScrape(r => r.gauge("ctf_uptime_seconds", "seconds since backend start")
  .set({}, Math.floor(Date.now() / 1000) - startedAt));

export const M = {
  solveFirstTotal: metrics.counter("ctf_solves_first_total", "first-time solves per challenge"),
  solveFlipTotal:  metrics.counter("ctf_solve_flips_total",  "isSolved state changes per challenge and direction"),
  apiRequestTotal: metrics.counter("ctf_api_requests_total", "API requests by endpoint and status class"),
  launchesTotal:   metrics.counter("ctf_launches_total",     "successful private-anvil launches per challenge"),
  launchFailTotal: metrics.counter("ctf_launches_failed_total", "failed launches per challenge and reason"),
  webhookFiredTotal: metrics.counter("ctf_webhook_fired_total", "outbound webhook attempts by event"),
  webhookFailedTotal: metrics.counter("ctf_webhook_failed_total", "outbound webhook failures by event"),
  instancesActive: metrics.gauge("ctf_instances_active",     "currently-running launcher instances per challenge"),
  trackedPlayers:  metrics.gauge("ctf_tracked_players",      "players currently in the solve tracker"),
  challengesTotal: metrics.gauge("ctf_challenges_total",     "configured challenges, by mode"),
  drainEnabled:    metrics.gauge("ctf_drain_enabled",        "1 when drain mode is on, 0 otherwise"),
};
