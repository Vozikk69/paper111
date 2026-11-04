/**
 * Minimal database auth — no Better Auth.
 * Email/password + session tokens stored in Postgres (or PGLite).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSql } from "../db";

const SESSION_DAYS = 30;
const SESSION_COOKIE = "lumen_session";

export { SESSION_COOKIE };

export type DbUser = {
  id: string;
  name: string;
  email: string;
};

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64).toString("hex");
  return { hash, salt: s };
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const { hash: next } = hashPassword(password, salt);
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(next, "hex"));
  } catch {
    return false;
  }
}

function packPassword(password: string): string {
  const { hash, salt } = hashPassword(password);
  return `${salt}:${hash}`;
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<DbUser> {
  const sql = await getSql();
  const email = input.email.trim().toLowerCase();
  const existing = await sql.query<{ id: string }>(
    `select id from "user" where email = $1 limit 1`,
    [email],
  );
  if (existing[0]) throw new Error("An account with this email already exists.");

  const id = newId();
  const now = new Date().toISOString();
  await sql.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, $2, $3, false, $4, $4)`,
    [id, input.name.trim() || email.split("@")[0], email, now],
  );
  await sql.query(
    `insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1, $2, 'credential', $3, $4, $5, $5)`,
    [newId(), email, id, packPassword(input.password), now],
  );
  return { id, name: input.name.trim() || email.split("@")[0], email };
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<DbUser | null> {
  const sql = await getSql();
  const normalized = email.trim().toLowerCase();
  const rows = await sql.query<{
    userId: string;
    name: string;
    email: string;
    password: string | null;
  }>(
    `select a."userId" as "userId", u.name, u.email, a.password
     from "account" a
     join "user" u on u.id = a."userId"
     where a."providerId" = 'credential' and u.email = $1
     limit 1`,
    [normalized],
  );
  const row = rows[0];
  if (!row?.password) return null;
  if (!verifyPassword(password, row.password)) return null;
  return { id: row.userId, name: row.name, email: row.email };
}

export async function createSession(userId: string): Promise<string> {
  const sql = await getSql();
  const token = randomBytes(32).toString("hex");
  const id = newId();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql.query(
    `insert into "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
     values ($1, $2, $3, $4, $4, $5)`,
    [id, expires.toISOString(), token, now.toISOString(), userId],
  );
  return token;
}

export async function getUserBySessionToken(
  token: string | null | undefined,
): Promise<DbUser | null> {
  if (!token) return null;
  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    name: string;
    email: string;
    expiresAt: string;
  }>(
    `select u.id, u.name, u.email, s."expiresAt" as "expiresAt"
     from "session" s
     join "user" u on u.id = s."userId"
     where s.token = $1
     limit 1`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await sql.query(`delete from "session" where token = $1`, [token]);
    return null;
  }
  return { id: row.id, name: row.name, email: row.email };
}

export async function deleteSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  const sql = await getSql();
  await sql.query(`delete from "session" where token = $1`, [token]);
}

export function sessionCookieHeader(token: string, maxAgeSeconds = SESSION_DAYS * 86400): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
