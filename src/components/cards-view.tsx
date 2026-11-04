import { useMemo, useRef, useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, Meter, Modal, Panel, fieldClass, selectClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  REVIEW_BUTTONS,
  formatCardDue,
  getDueCards,
  previewInterval,
  type Flashcard,
  type ReviewQuality,
  type Subject,
} from "@/lib/study/domain";
import { addFlashcard, deleteFlashcard, generateFlashcards, logSession, reviewFlashcard, updateFlashcard } from "@/lib/study/server";
import { errText, useDesk, useRefreshDesk } from "@/lib/study/use-desk";

export function CardsView({ startReview }: { startReview: boolean }) {
  const query = useDesk();
  const refresh = useRefreshDesk();
  const [subjectId, setSubjectId] = useState("all");
  const [reviewing, setReviewing] = useState(startReview);
  const [sessionMode, setSessionMode] = useState<"review" | "practice">("review");
  const [composer, setComposer] = useState<"add" | "generate" | null>(null);
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (query.isLoading || !query.data) return <p className="text-mute">Loading cards…</p>;
  const data = query.data;
  const validSubjectId = subjectId === "all" || data.subjects.some((subject) => subject.id === subjectId) ? subjectId : "all";
  const filtered = data.flashcards.filter((card) => validSubjectId === "all" || card.subjectId === validSubjectId);
  const due = getDueCards(filtered);
  const subjects = data.subjects;

  const queue = sessionMode === "review" ? due : filtered;
  if (reviewing && queue.length) {
    return (
      <ReviewSession
        cards={queue}
        subjects={subjects}
        mode={sessionMode}
        onExit={async (reviewed, minutes, subject) => {
          setReviewing(false);
          if (reviewed > 0) {
            try {
              await logSession({
                data: { subjectId: subject, durationMinutes: Math.max(1, minutes), type: "cards" },
              });
            } catch (error) {
              toast.error(errText(error));
            }
          }
          await refresh();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-mute">Cards</p>
          <h1 className="font-display text-3xl leading-none">Flashcards</h1>
          <p className="mt-2 text-sm text-mute">{filtered.length} in this deck · {due.length} due for review</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="line" onClick={() => setComposer("generate")} disabled={!subjects.length}>
            Generate
          </Button>
          <Button onClick={() => setComposer("add")} disabled={!subjects.length}>
            New card
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-mute">
          Filter by subject
          <select className={`${selectClass} max-w-xs`} value={validSubjectId} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="all">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.title}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={!due.length} onClick={() => { setSessionMode("review"); setReviewing(true); }}>
          {due.length ? `Review ${due.length} due` : "Nothing due"}
        </Button>
        {filtered.length > 0 && (
          <Button variant="line" onClick={() => { setSessionMode("practice"); setReviewing(true); }}>
            Practice all {filtered.length}
          </Button>
        )}
        {due.length === 0 && filtered.length > 0 && (
          <span className="text-xs text-mute">Practice mode leaves review dates unchanged.</span>
        )}
      </div>

      {filtered.length === 0 ? (
        <Panel className="p-6">
          <h2 className="font-display text-3xl">{subjects.length ? "No cards yet" : "Add a subject first"}</h2>
          <p className="mt-2 text-sm text-mute">Write a card, generate some from your notes, or save one from the tutor.</p>
        </Panel>
      ) : (
        <ul className="grid gap-2">
          {filtered.map((card) => (
            <li key={card.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{card.frontText}</p>
                <p className="text-xs text-mute">
                  {subjects.find((subject) => subject.id === card.subjectId)?.title ?? "Subject"}
                  {" · "}
                  {formatCardDue(card)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-mute"><span className="text-parchment">Answer:</span> {card.backText}</p>
              </div>
              <button type="button" aria-label="Edit card" className="grid h-11 w-11 place-items-center text-mute hover:text-parchment" onClick={() => setEditing(card)}>
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Delete card"
                disabled={deletingId === card.id}
                className="grid h-11 w-11 place-items-center text-mute hover:text-coral"
                onClick={async () => {
                  if (!window.confirm(`Delete this card?\n\n${card.frontText}`)) return;
                  setDeletingId(card.id);
                  try {
                    await deleteFlashcard({ data: { id: card.id } });
                    await refresh();
                  } catch (error) {
                    toast.error(errText(error));
                  } finally {
                    setDeletingId(null);
                  }
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <CardDialog
        open={composer === "add" || Boolean(editing)}
        title={editing ? "Edit card" : "New card"}
        subjects={subjects}
        initial={editing}
        onClose={() => {
          setComposer(null);
          setEditing(null);
        }}
        onSaved={async () => {
          setComposer(null);
          setEditing(null);
          await refresh();
        }}
      />
      <GenerateDialog
        open={composer === "generate"}
        subjects={subjects}
        defaultSubjectId={validSubjectId === "all" ? subjects[0]?.id ?? "" : validSubjectId}
        onClose={() => setComposer(null)}
        onSaved={async (count, duplicatesSkipped) => {
          setComposer(null);
          if (count === 0 && duplicatesSkipped > 0) {
            toast.message("No new cards: the clear questions are already in this deck.");
          } else if (duplicatesSkipped > 0) {
            toast.success(`${count} ${count === 1 ? "card" : "cards"} added; skipped ${duplicatesSkipped} duplicates`);
          } else {
            toast.success(`${count} ${count === 1 ? "card" : "cards"} added`);
          }
          await refresh();
        }}
      />
    </div>
  );
}

function ReviewSession({
  cards,
  subjects,
  mode,
  onExit,
}: {
  cards: Flashcard[];
  subjects: Subject[];
  mode: "review" | "practice";
  onExit: (reviewed: number, minutes: number, subjectId: string | null) => void;
}) {
  const queue = useMemo(() => cards.map((card) => card.id), [cards]);
  const snapshot = useRef(new Map(cards.map((card) => [card.id, card])));
  const started = useRef(Date.now());
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const finished = index >= queue.length;
  const card = finished ? null : snapshot.current.get(queue[index]);

  async function grade(quality: ReviewQuality) {
    if (!card || busy || mode !== "review") return;
    setBusy(true);
    try {
      await reviewFlashcard({ data: { id: card.id, quality } });
      setFlipped(false);
      setIndex((value) => value + 1);
    } catch (error) {
      toast.error(errText(error));
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    const minutes = (Date.now() - started.current) / 60000;
    const seen = Math.min(queue.length, index + (flipped ? 1 : 0));
    const reviewedSubjects = [...new Set(cards.slice(0, seen).map((item) => item.subjectId))];
    onExit(seen, minutes, reviewedSubjects.length === 1 ? reviewedSubjects[0] : null);
  }

  function nextPracticeCard() {
    if (busy || !flipped) return;
    setFlipped(false);
    setIndex((value) => value + 1);
  }

  if (finished || !card) {
    return (
      <Panel className="mx-auto max-w-xl p-8 text-center">
        <Check className="mx-auto size-8 text-sage" />
        <h2 className="mt-3 font-display text-2xl">{mode === "review" ? "Review complete" : "Practice complete"}</h2>
        <p className="mt-2 text-sm text-mute">
          {queue.length} {queue.length === 1 ? "card" : "cards"}. {mode === "review" ? "The next review dates are set." : "Review dates were left unchanged."}
        </p>
        <Button className="mt-5" onClick={leave}>
          Back to the deck
        </Button>
      </Panel>
    );
  }

  const subject = subjects.find((item) => item.id === card.subjectId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Meter value={(index / queue.length) * 100} label="Review progress" />
        </div>
        <span className="text-sm tabular-nums text-mute">
          {index + 1} / {queue.length}
        </span>
        <Button variant="ghost" onClick={leave}>
          End
        </Button>
      </div>
      <button type="button" className="card-scene text-left" onClick={() => setFlipped((value) => !value)} aria-label={flipped ? "Show the question" : "Reveal the answer"}>
        <div className={cn("card-inner", flipped && "is-flipped")}>
          <div className="card-face flex flex-col rounded-lg border border-line bg-panel p-6">
            <p className="text-xs text-mute">{mode === "review" ? "Review" : "Practice"} · {subject?.title ?? "Question"}</p>
            <p className="mt-3 overflow-auto font-display text-3xl leading-tight">{card.frontText}</p>
            <p className="mt-auto pt-6 text-xs text-mute">Tap to reveal</p>
          </div>
          <div className="card-face card-back flex flex-col rounded-lg border border-brass bg-ink p-6">
            <p className="text-xs text-brass">Answer</p>
            <p className="mt-3 overflow-auto text-lg leading-snug">{card.backText}</p>
            <p className="mt-auto pt-6 text-xs text-mute">Tap to flip back</p>
          </div>
        </div>
      </button>
      {flipped && mode === "review" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REVIEW_BUTTONS.map((button) => (
            <button
              key={button.label}
              type="button"
              disabled={busy}
              onClick={() => grade(button.quality)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-md border px-2 text-sm font-semibold",
                button.quality === 1 && "border-line text-coral",
                button.quality === 3 && "border-line text-mute",
                button.quality === 4 && "border-brass bg-brass text-on-brass",
                button.quality === 5 && "border-line text-sage",
              )}
            >
              {button.label}
              <span className="text-xs font-normal opacity-80">{button.hint}</span>
              <span className="text-xs font-normal opacity-80">Next: {previewInterval(card, button.quality)}</span>
            </button>
          ))}
        </div>
      ) : flipped ? (
        <Button onClick={nextPracticeCard}>Next card</Button>
      ) : (
        <p className="text-center text-sm text-mute">{mode === "review" ? "Recall first, then choose how well you remembered." : "Try to recall the answer before you reveal it."}</p>
      )}
    </div>
  );
}

function CardDialog({
  open,
  title,
  subjects,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  title: string;
  subjects: Subject[];
  initial: Flashcard | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const frontText = String(form.get("front") ?? "").trim();
          const backText = String(form.get("back") ?? "").trim();
          if (!frontText || !backText) {
            toast.error("Write a question and an answer before saving.");
            return;
          }
          setBusy(true);
          try {
            if (initial) {
              await updateFlashcard({
                data: { id: initial.id, frontText, backText },
              });
            } else {
              await addFlashcard({
                data: {
                  subjectId: String(form.get("subjectId") ?? ""),
                  frontText,
                  backText,
                },
              });
            }
            onSaved();
          } catch (error) {
            toast.error(errText(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        {!initial && (
          <Field label="Subject">
            <select name="subjectId" className={selectClass} defaultValue={subjects[0]?.id}>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Front">
          <textarea name="front" required rows={3} defaultValue={initial?.frontText ?? ""} className={`${fieldClass} py-2`} />
        </Field>
        <Field label="Back">
          <textarea name="back" required rows={3} defaultValue={initial?.backText ?? ""} className={`${fieldClass} py-2`} />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save card"}
        </Button>
      </form>
    </Modal>
  );
}

function GenerateDialog({
  open,
  subjects,
  defaultSubjectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  subjects: Subject[];
  defaultSubjectId: string;
  onClose: () => void;
  onSaved: (count: number, duplicatesSkipped: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title="Generate cards" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          try {
            const result = await generateFlashcards({
              data: {
                subjectId: String(form.get("subjectId") ?? ""),
                count: Number(form.get("count") ?? 8),
                extra: String(form.get("extra") ?? ""),
              },
            });
            onSaved(result.cards.length, result.duplicatesSkipped);
          } catch (error) {
            toast.error(errText(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-mute">Creates up to the selected number from this subject’s notes. Weak questions and cards already in this deck are skipped.</p>
        <Field label="Subject">
          <select name="subjectId" className={selectClass} defaultValue={defaultSubjectId}>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How many">
          <input name="count" type="number" min={1} max={12} defaultValue={8} className={fieldClass} />
        </Field>
        <Field label="Extra material, optional">
          <textarea name="extra" rows={4} className={`${fieldClass} py-2`} placeholder="Paste a passage if the subject has thin notes." />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Writing cards…" : "Generate"}
        </Button>
      </form>
    </Modal>
  );
}
