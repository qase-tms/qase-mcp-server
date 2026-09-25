import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

const DEFAULT_PER_MINUTE = 600;
const WINDOW_MS = 60_000;

/**
 * Read the per-IP request budget for the MCP endpoint.
 *
 * `QASE_MCP_RATE_LIMIT_PER_MINUTE=0` turns the limiter off; anything that is not
 * a non-negative integer falls back to the default rather than failing startup,
 * matching how QASE_MCP_SESSION_TTL_MINUTES is read.
 */
export function readRateLimitPerMinute(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.QASE_MCP_RATE_LIMIT_PER_MINUTE;
  return raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : DEFAULT_PER_MINUTE;
}

/**
 * Rate-limit the MCP endpoint, keyed by client IP.
 *
 * Our edge rate limit sits on api.qase.io, which is downstream of this process:
 * it caps the calls we make, not the ones we receive. So without this an
 * unauthenticated caller can drive JSON body parsing and a JWT signature verify
 * on every request. Mount it ahead of the auth guard so a flood is rejected at
 * the cheapest point.
 *
 * The budget is deliberately generous: a single NAT'd office shares one IP, and
 * an MCP session is chatty (one request per tool call). It is a ceiling on abuse,
 * not a fair-use quota.
 */
export function createMcpRateLimiter(perMinute: number = readRateLimitPerMinute()): RequestHandler {
  if (perMinute <= 0) {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs: WINDOW_MS,
    limit: perMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Answer in JSON-RPC, not express's plain-text default: the caller is an MCP
    // client that will try to parse whatever comes back as a JSON-RPC response.
    handler: (_req, res) => {
      res.status(429).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Too many requests' },
      });
    },
  });
}
