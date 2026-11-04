import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { CardsView } from "@/components/cards-view";

export const Route = createFileRoute("/cards")({
  validateSearch: (search: Record<string, unknown>) => ({
    review: search.review === true || search.review === "true" || search.review === "1" || search.review === 1,
  }),
  component: CardsPage,
});

function CardsPage() {
  const { review } = Route.useSearch();
  return (
    <AppShell>
      <CardsView startReview={review} />
    </AppShell>
  );
}
