/** Default cap on a JSON request body, in megabytes. */
const DEFAULT_LIMIT_MB = 10;

/**
 * The size cap for `express.json()` on the network transports.
 *
 * It exists because `qase_attachment_upload` sends file content as base64
 * inside the JSON-RPC body — on a network transport that is the only option,
 * since the server cannot see the caller's filesystem. express defaults to
 * 100kb, which silently capped uploads at roughly 75kb of file while the tool
 * advertised far more.
 *
 * The ceiling is a memory decision, not a Qase one: base64 inflates a file by
 * a third, and every byte is held while the body is parsed and decoded. Qase
 * itself accepts 32 MB per file — reachable over stdio with `file_path`, where
 * no body carries the bytes.
 *
 * An unreadable or zero value falls back to the default rather than disabling
 * the cap: an unlimited body on a public endpoint is a memory-exhaustion knob,
 * so this one does not offer an off switch (unlike the rate limiter, where 0
 * is a legitimate choice for a private deployment).
 */
function readLimitMb(env: Record<string, string | undefined>): number {
  const raw = env.QASE_MCP_BODY_LIMIT_MB;
  const parsed = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : 0;
  return parsed > 0 ? parsed : DEFAULT_LIMIT_MB;
}

export function readBodyLimit(env: Record<string, string | undefined> = process.env): string {
  return `${readLimitMb(env)}mb`;
}

/**
 * The same cap as `readBodyLimit()`, in bytes.
 *
 * `express.json()` takes the human string; the MCP handler and the Node
 * adapter take a number of bytes and default to 4 MiB of their own. Left at
 * that default they would answer 413 long before express ever saw the body,
 * silently undoing the 10 MB limit release 2.7.5 set for attachment uploads —
 * so both sides are fed from this one function, and a test pins them to each
 * other.
 */
export function bodyLimitBytes(env: Record<string, string | undefined> = process.env): number {
  return readLimitMb(env) * 1024 * 1024;
}
