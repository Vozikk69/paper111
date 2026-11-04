import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { SubjectsView } from "@/components/subjects-view";

export const Route = createFileRoute("/subjects")({
  component: SubjectsPage,
});

function SubjectsPage() {
  return (
    <AppShell>
      <SubjectsView />
    </AppShell>
  );
}
