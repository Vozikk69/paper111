import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DeskView } from "@/components/desk";

export const Route = createFileRoute("/")({
  component: DeskPage,
});

function DeskPage() {
  return (
    <AppShell>
      <DeskView />
    </AppShell>
  );
}
