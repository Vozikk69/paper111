import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PlanView } from "@/components/plan-view";

export const Route = createFileRoute("/plan")({
  component: PlanPage,
});

function PlanPage() {
  return (
    <AppShell>
      <PlanView />
    </AppShell>
  );
}
