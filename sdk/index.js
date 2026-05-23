export class Ctf {
  constructor({ backend, challenge, player, fetch: customFetch }) {
    if (!backend)   throw new Error("backend URL required");
    if (!challenge) throw new Error("challenge id required");
    if (!player)    throw new Error("player address required");
    this.backend = backend.replace(/\/+$/, "");
    this.challenge = challenge;
    this.player = player;
    this._fetch = customFetch ?? globalThis.fetch;
    if (!this._fetch) throw new Error("no fetch implementation");
  }

  async _call(path, opts = {}) {
    const url = `${this.backend}${path}`;
    const r = await this._fetch(url, opts);
    const text = await r.text();
    if (!r.ok) {
      let detail = text;
      try { detail = JSON.parse(text).error ?? text; } catch {}
      throw new CtfApiError(r.status, `${path}: ${detail}`, r.status);
    }
    try { return JSON.parse(text); }
    catch { return text; }
  }

  config()     { return this._call(`/api/config`); }
  health()     { return this._call(`/api/health`); }
  scoreboard() { return this._call(`/api/scoreboard`); }

  getStatus() {
    return this._call(`/api/status/${this.challenge}?address=${this.player}`);
  }
  getInstance() {
    return this._call(`/api/instance/${this.challenge}?address=${this.player}`);
  }
  getSignature() {
    return this._call(`/api/sign/${this.challenge}?address=${this.player}`);
  }

  spawn() {
    return this._call(`/api/launch/${this.challenge}?address=${this.player}`, { method: "POST" });
  }
  kill() {
    return this._call(`/api/kill/${this.challenge}?address=${this.player}`,   { method: "POST" });
  }
  reset() {
    return this._call(`/api/reset/${this.challenge}?address=${this.player}`,  { method: "POST" });
  }

  async claimFlag({ poll = 1, intervalMs = 2000 } = {}) {
    for (let i = 0; i < Math.max(1, poll); i++) {
      const r = await this._call(`/api/flag/${this.challenge}?address=${this.player}`);
      if (r.solved && r.flag) return r;
      if (i < poll - 1) await new Promise(res => setTimeout(res, intervalMs));
    }
    throw new CtfApiError(0, "flag never released — keep exploiting?");
  }

  async submitWriteup(text, { signWith } = {}) {
    const body = { writeup: String(text) };
    if (signWith) {
      const ethers = await loadEthers();
      const timestamp = Date.now();
      const bodyHash = ethers.keccak256(ethers.toUtf8Bytes(body.writeup));
      const msg = `ctf-writeup\n${this.challenge}\n${this.player}\n${timestamp}\n${bodyHash}`;
      const signature = await signWith.signMessage(msg);
      body.timestamp = timestamp;
      body.signature = signature;
    }
    return this._call(`/api/writeup/${this.challenge}?address=${this.player}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

export class CtfApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "CtfApiError";
    this.status = status;
  }
}

async function loadEthers() {
  // Soft dep: only imported when the caller actually signs something.
  try { return await import("ethers"); }
  catch {
    throw new Error("submitWriteup with signWith requires the `ethers` package on your path");
  }
}

export default Ctf;
