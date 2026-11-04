/**
 * Browser auth client — talks to /api/auth/* (database-backed, no Better Auth).
 */

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

type AuthResult = {
  data?: { user?: { id: string; name?: string; email?: string } | null } | null;
  error?: { message: string } | null;
  user?: { id: string; name?: string; email?: string } | null;
};

async function post(path: string, body: Record<string, unknown>): Promise<AuthResult> {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as AuthResult & {
    error?: { message?: string } | string;
  };
  if (!res.ok) {
    const message =
      typeof json.error === "string"
        ? json.error
        : json.error?.message || "Request failed";
    return { error: { message }, data: null };
  }
  return {
    data: { user: json.user ?? json.data?.user ?? null },
    error: null,
    user: json.user ?? json.data?.user ?? null,
  };
}

export const authClient = {
  signUp: {
    email: async (input: {
      email: string;
      password: string;
      name: string;
      callbackURL?: string;
    }) => post("sign-up/email", input),
  },
  signIn: {
    email: async (input: {
      email: string;
      password: string;
      callbackURL?: string;
    }) => post("sign-in/email", input),
  },
  signOut: async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
    });
    return { error: null };
  },
  getSession: async () => {
    const res = await fetch("/api/auth/get-session", { credentials: "include" });
    if (!res.ok) return { data: null, error: { message: "Failed to load session" } };
    const json = await res.json();
    return { data: json, error: null };
  },
};

/** Kept for middleware compatibility (always null outside old preview). */
export function getBearerToken(): string | null {
  return null;
}

export async function signOut(redirectTo = "/"): Promise<void> {
  await authClient.signOut();
  if (typeof window !== "undefined") {
    window.location.href = redirectTo;
  }
}
