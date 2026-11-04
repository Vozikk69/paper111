import { createFileRoute } from "@tanstack/react-router";
import {
  clearSessionCookieHeader,
  createSession,
  createUser,
  deleteSession,
  getUserBySessionToken,
  readSessionCookie,
  sessionCookieHeader,
  verifyCredentials,
} from "@/lib/auth/db-auth.server";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const path = String(params._splat ?? "");
        if (path === "get-session" || path === "session") {
          const token = readSessionCookie(request);
          const user = await getUserBySessionToken(token);
          if (!user) return json({ user: null, session: null });
          return json({
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              image: null,
            },
            session: { token },
          });
        }
        return json({ error: "Not found" }, { status: 404 });
      },
      POST: async ({ request, params }) => {
        const path = String(params._splat ?? "");
        const body = await readJson(request);

        if (path === "sign-up/email" || path === "signup") {
          const email = String(body.email ?? "").trim();
          const password = String(body.password ?? "");
          const name = String(body.name ?? "").trim();
          if (!email || !password || password.length < 8) {
            return json({ error: { message: "Email and password (min 8 chars) required." } }, { status: 400 });
          }
          try {
            const user = await createUser({ email, password, name });
            const token = await createSession(user.id);
            return json(
              { user: { id: user.id, name: user.name, email: user.email }, error: null },
              { headers: { "set-cookie": sessionCookieHeader(token) } },
            );
          } catch (err) {
            return json(
              { error: { message: err instanceof Error ? err.message : "Could not create account." } },
              { status: 400 },
            );
          }
        }

        if (path === "sign-in/email" || path === "signin") {
          const email = String(body.email ?? "").trim();
          const password = String(body.password ?? "");
          const user = await verifyCredentials(email, password);
          if (!user) {
            return json({ error: { message: "Invalid email or password." } }, { status: 401 });
          }
          const token = await createSession(user.id);
          return json(
            { user: { id: user.id, name: user.name, email: user.email }, error: null },
            { headers: { "set-cookie": sessionCookieHeader(token) } },
          );
        }

        if (path === "sign-out" || path === "signout") {
          const token = readSessionCookie(request);
          await deleteSession(token);
          return json(
            { success: true },
            { headers: { "set-cookie": clearSessionCookieHeader() } },
          );
        }

        return json({ error: "Not found" }, { status: 404 });
      },
    },
  },
});
