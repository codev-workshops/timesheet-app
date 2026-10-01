const defaultSleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class TokenBucket {
  constructor({ capacity, refillPerSecond, now = Date.now, sleep = defaultSleep }) {
    if (!(capacity > 0) || !(refillPerSecond > 0)) {
      throw new Error('TokenBucket requires positive capacity and refillPerSecond');
    }
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.tokens = capacity;
    this.now = now;
    this.sleep = sleep;
    this.lastRefill = now();
  }

  refill() {
    const current = this.now();
    const elapsedSeconds = (current - this.lastRefill) / 1000;
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
      this.lastRefill = current;
    }
  }

  async take() {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil(((1 - this.tokens) / this.refillPerSecond) * 1000);
      await this.sleep(waitMs);
    }
  }
}

function createRateLimiterFromEnv(env = process.env) {
  const rpm = Number(env.LLM_RATE_LIMIT_RPM) || 60;
  return new TokenBucket({ capacity: Math.max(1, Math.min(rpm, 10)), refillPerSecond: rpm / 60 });
}

module.exports = {
  TokenBucket,
  createRateLimiterFromEnv,
  defaultSleep
};
