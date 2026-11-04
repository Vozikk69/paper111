import { useState, type FormEvent } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BootScreen } from "@/components/app-shell";
import { Button, Field, fieldClass } from "@/components/ui";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isPending) return <BootScreen />;
  if (user) return <Navigate to="/" />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({ email, password, name, callbackURL: "/" })
          : await authClient.signIn.email({ email, password, callbackURL: "/" });
      if (result.error) {
        setError(result.error.message || "Could not sign in.");
        return;
      }
      // Full reload so session cookie is picked up cleanly
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh bg-ink text-parchment lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-r border-line px-12 py-12 lg:flex">
        <p className="font-display text-4xl">Lumen</p>
        <div>
          <p className="max-w-md font-display text-5xl leading-tight">The exam is a date. The work is a rhythm.</p>
          <p className="mt-4 max-w-sm text-sm text-mute">
            A tutor that reads your notes, cards that come back when you are about to forget them, and a plan that ends the day before the exam.
          </p>
        </div>
        <p className="text-xs text-mute">Focus 25 · Break 5</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <p className="font-display text-4xl lg:hidden">Lumen</p>
          <h1 className="mt-3 font-display text-4xl leading-none">
            {mode === "up" ? "Open a desk" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-mute">Your notes, cards, and streak stay on this account.</p>

          <form className="mt-6 flex flex-col gap-3" onSubmit={onSubmit}>
            {mode === "up" && (
              <Field label="Name">
                <input name="name" required autoComplete="name" className={fieldClass} />
              </Field>
            )}
            <Field label="Email">
              <input name="email" type="email" required autoComplete="email" className={fieldClass} />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                className={fieldClass}
              />
            </Field>
            {error && <p className="text-sm text-coral">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? "One moment…" : mode === "up" ? "Create account" : "Sign in"}
            </Button>
          </form>
          <button
            type="button"
            className="mt-4 min-h-11 text-sm text-mute hover:text-parchment"
            onClick={() => {
              setMode(mode === "up" ? "in" : "up");
              setError("");
            }}
          >
            {mode === "up" ? "Already have a desk? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </section>
    </main>
  );
}
