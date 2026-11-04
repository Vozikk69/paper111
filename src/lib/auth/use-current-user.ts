import { useEffect, useMemo, useState } from "react";
import { authClient, authEnabled } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: boolean;
};

export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
};

export type CurrentUserState = {
  user: AppUser | null;
  isPending: boolean;
};

const DEV_STATE: CurrentUserState = { user: DEV_USER, isPending: false };

export function useCurrentUserState(): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>(
    authEnabled ? { user: null, isPending: true } : DEV_STATE,
  );

  useEffect(() => {
    if (!authEnabled) {
      setState(DEV_STATE);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await authClient.getSession();
        if (cancelled) return;
        const u = data?.user;
        if (u?.id) {
          setState({
            user: {
              id: u.id,
              displayName: u.name ?? null,
              primaryEmail: u.email ?? null,
              profileImageUrl: null,
              isDevFallback: false,
            },
            isPending: false,
          });
        } else {
          setState({ user: null, isPending: false });
        }
      } catch {
        if (!cancelled) setState({ user: null, isPending: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => state, [state]);
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
