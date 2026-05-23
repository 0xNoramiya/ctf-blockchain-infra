import fs from "node:fs";
import path from "node:path";

const DEFAULT_PATH = process.env.WRITEUPS_PATH ?? "/var/lib/ctf/writeups.jsonl";
const MAX_LEN = Number(process.env.WRITEUP_MAX_BYTES ?? 4096);

export class WriteupStore {
  constructor(filePath = DEFAULT_PATH) {
    this.filePath = filePath;
    try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); }
    catch {}
  }

  get maxLen() { return MAX_LEN; }

  append({ challengeId, player, writeup, ip = null, signed = false }) {
    if (typeof writeup !== "string") throw new Error("writeup must be a string");
    const trimmed = writeup.trim();
    if (!trimmed) throw new Error("empty writeup");
    if (Buffer.byteLength(trimmed, "utf8") > MAX_LEN) {
      throw new Error(`writeup too long (max ${MAX_LEN} bytes)`);
    }
    const record = {
      ts: new Date().toISOString(),
      challenge: challengeId,
      player,
      writeup: trimmed,
      ip,
      signed,
    };
    fs.appendFileSync(this.filePath, JSON.stringify(record) + "\n");
    return record;
  }

  all(filter = null) {
    if (!fs.existsSync(this.filePath)) return [];
    const out = [];
    for (const line of fs.readFileSync(this.filePath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const r = JSON.parse(trimmed);
        if (!filter || filter(r)) out.push(r);
      } catch {}
    }
    return out;
  }
}
