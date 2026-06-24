/**
 * A JWT has exactly three non-empty dot-separated segments
 * (header.payload.signature). Anything else is treated as an opaque
 * legacy api-token.
 */
export function isJwt(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}
