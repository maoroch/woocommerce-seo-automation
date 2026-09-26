// src/lib/token-limiter.js
class TokenLimiter {
  constructor(limitTokens, intervalMs) {
    this.limitTokens = limitTokens;
    this.intervalMs = intervalMs;
    this.tokensUsed = 0;
    this.resetTime = Date.now() + intervalMs;
  }

  async waitForTokens(requiredTokens) {
    while (true) {
      const now = Date.now();
      if (now >= this.resetTime) {
        this.tokensUsed = 0;
        this.resetTime = now + this.intervalMs;
      }
      if (this.tokensUsed + requiredTokens <= this.limitTokens) {
        this.tokensUsed += requiredTokens;
        return;
      }
      const waitMs = this.resetTime - now;
      await new Promise(resolve => setTimeout(resolve, Math.min(waitMs, 1000)));
    }
  }
}

let instance = null;
export function getTokenLimiter(limitTokens = 10000, intervalMs = 10 * 60 * 1000) {
  if (!instance) instance = new TokenLimiter(limitTokens, intervalMs);
  return instance;
}