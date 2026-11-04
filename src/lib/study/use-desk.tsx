import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { getWorkspace } from "@/lib/study/server";

export function useWorkspaceQuery(userId: string | undefined) {
  return useQuery({
    queryKey: ["workspace", userId],
    enabled: Boolean(userId),
    queryFn: () => getWorkspace(),
  });
}

export const DeskContext = createContext<ReturnType<typeof useWorkspaceQuery> | null>(null);

export function useDesk() {
  const value = useContext(DeskContext);
  if (!value) throw new Error("Desk is not ready.");
  return value;
}

export function useRefreshDesk() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["workspace"] });
}

export function errText(error: unknown) {
  if (error instanceof Error && error.message) return error.message.replace(/^Error:\s*/, "");
  if (typeof error === "string") return error;
  return "Something went wrong.";
}
