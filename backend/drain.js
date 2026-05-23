export const drain = {
  on: false,
  reason: null,
  since: null,
  enable(reason = null) {
    this.on = true;
    this.reason = reason;
    this.since = Math.floor(Date.now() / 1000);
  },
  disable() {
    this.on = false;
    this.reason = null;
    this.since = null;
  },
  state() {
    return { on: this.on, reason: this.reason, since: this.since };
  },
};
