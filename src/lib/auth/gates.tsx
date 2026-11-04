import { Link, Navigate } from "@tanstack/react-router";
import { authClient } from "./client";
import { useCurrentUserState } from "./use-current-user";

export function RedirectToSignIn() {
  return <Navigate to="/login" />;
}

export function UserButton() {
  const { user } = useCurrentUserState();
  if (!user) return null;

  async function signOut() {
    try {
      await authClient.signOut();
    } catch {
      // ignore
    }
    window.location.href = "/login";
  }

  const label = user.displayName || user.primaryEmail || "Account";

  return (
    <div className="relative group">
      <button
        type="button"
        className="flex min-h-11 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm text-parchment"
        title={label}
      >
        <span className="grid size-7 place-items-center rounded-full bg-brass/20 text-xs font-semibold text-brass">
          {(label[0] || "?").toUpperCase()}
        </span>
        <span className="hidden max-w-[8rem] truncate sm:inline">{label}</span>
      </button>
      <div className="absolute right-0 top-full z-50 mt-1 hidden min-w-[10rem] rounded-md border border-line bg-ink p-1 shadow-lg group-focus-within:block group-hover:block">
        <button
          type="button"
          onClick={signOut}
          className="block w-full rounded px-3 py-2 text-left text-sm text-mute hover:bg-panel hover:text-parchment"
        >
          Sign out
        </button>
        <Link
          to="/login"
          className="block rounded px-3 py-2 text-sm text-mute hover:bg-panel hover:text-parchment"
        >
          Account
        </Link>
      </div>
    </div>
  );
}
