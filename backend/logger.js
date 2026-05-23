import crypto from "node:crypto";

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };
const LEVEL_NAME = Object.fromEntries(Object.entries(LEVELS).map(([k, v]) => [v, k]));

const minLevel = LEVELS[(process.env.LOG_LEVEL ?? "info").toLowerCase()] ?? LEVELS.info;
const fmt = (process.env.LOG_FORMAT ?? (process.env.NODE_ENV === "production" ? "json" : "pretty")).toLowerCase();

function emit(level, msg, fields = {}) {
  if (level < minLevel) return;
  const rec = {
    ts: new Date().toISOString(),
    level: LEVEL_NAME[level],
    msg,
    ...fields,
  };
  const line = fmt === "json"
    ? JSON.stringify(rec)
    : `${rec.ts} ${rec.level.padEnd(5)} ${rec.msg} ` +
      Object.entries(fields).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ");
  process.stdout.write(line + "\n");
}

export const log = {
  trace: (msg, f) => emit(LEVELS.trace, msg, f),
  debug: (msg, f) => emit(LEVELS.debug, msg, f),
  info:  (msg, f) => emit(LEVELS.info,  msg, f),
  warn:  (msg, f) => emit(LEVELS.warn,  msg, f),
  error: (msg, f) => emit(LEVELS.error, msg, f),
};

const PII_PARAMS = new Set(["address"]);
export function safePath(urlOrReq) {
  const raw = typeof urlOrReq === "string"
    ? urlOrReq
    : (urlOrReq.originalUrl ?? urlOrReq.url);
  try {
    const u = new URL(raw, "http://x");
    for (const k of PII_PARAMS) {
      const v = u.searchParams.get(k);
      if (v) u.searchParams.set(k, v.slice(0, 6) + "..." + v.slice(-4));
    }
    return u.pathname + (u.search ? u.search : "");
  } catch { return raw; }
}

export function statusToLevel(status) {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

export function requestLogger() {
  return (req, res, next) => {
    const id = (req.headers["x-request-id"]?.toString() ?? "")
      || crypto.randomBytes(6).toString("hex");
    req.id = id;
    req.log = (msg, fields) => log.info(msg, { req_id: id, ...fields });
    res.setHeader("x-request-id", id);

    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const dur = Number(process.hrtime.bigint() - start) / 1e6;
      const fields = {
        req_id: id,
        method: req.method,
        path: safePath(req),
        status: res.statusCode,
        latency_ms: Math.round(dur * 100) / 100,
        ip: req.ip,
      };
      emit(LEVELS[statusToLevel(res.statusCode)], "request", fields);
    });
    next();
  };
}
