import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { TutorView } from "@/components/tutor-view";

export const Route = createFileRoute("/tutor")({
  component: TutorPage,
});

function TutorPage() {
  return (
    <AppShell>
      <TutorView />
    </AppShell>
  );
}
