/**
 * Compatibility shim — Better Auth removed.
 * Real auth lives in db-auth.server.ts + /api/auth/* routes.
 */
export const authConfigured = process.env.VITE_AUTH_ENABLED !== "false";
export const SESSION_TOKEN_COOKIE = "lumen_session";

export function readSessionToken(): string | null {
  return null;
}
