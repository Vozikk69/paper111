import { getRequest } from "@tanstack/react-start/server";
import {
  getUserBySessionToken,
  readSessionCookie,
} from "./db-auth.server";

const DEV_USER_ID = "dev-user";

const databaseConfigured = Boolean(
  typeof process !== "undefined" && process.env.DATABASE_URL?.trim(),
);

const authDisabled = process.env.VITE_AUTH_ENABLED === "false";

export const authConfigured = !authDisabled;

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

export async function getSessionUser(
  _bearerToken?: string,
): Promise<VerifiedUser | null> {
  if (!authConfigured) return null;
  const request = getRequest();
  if (!request) return null;
  const token = readSessionCookie(request);
  const user = await getUserBySessionToken(token);
  if (!user) return null;
  return { id: user.id, email: user.email };
}

export async function requireUserId(_bearerToken?: string): Promise<string> {
  if (!authConfigured) {
    if (databaseConfigured) {
      throw new Error(
        "Auth is disabled (VITE_AUTH_ENABLED=false) but DATABASE_URL is set — " +
          "refusing to fall back to the shared dev user against a real database.",
      );
    }
    return DEV_USER_ID;
  }
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
