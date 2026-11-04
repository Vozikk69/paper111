import { useState } from "react";
import { Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyLine, Field, Modal, Panel, fieldClass } from "@/components/ui";
import { daysUntil, type Subject } from "@/lib/study/domain";
import { addSubject, deleteNote, deleteSubject, ingestNote, ingestText, updateSubject } from "@/lib/study/server";
import { errText, useDesk, useRefreshDesk } from "@/lib/study/use-desk";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export function SubjectsView() {
  const query = useDesk();
  const refresh = useRefreshDesk();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  if (query.isLoading || !query.data) return <p className="text-mute">Loading subjects…</p>;
  if (query.isError) return <p>Could not load subjects.</p>;

  const data = query.data;
  const selected = data.subjects.find((subject) => subject.id === selectedId) ?? data.subjects[0] ?? null;
  const notes = selected ? data.notes.filter((note) => note.subjectId === selected.id) : [];

  async function saveSubject(input: { title: string; description: string; targetDate: string }) {
    setBusy(true);
    try {
      if (editing) {
        await updateSubject({
          data: { id: editing.id, title: input.title, description: input.description, targetDate: input.targetDate || null },
        });
      } else {
        const created = await addSubject({
          data: { title: input.title, description: input.description, targetDate: input.targetDate || null },
        });
        setSelectedId(created.id);
      }
      await refresh();
      setOpen(false);
      setEditing(null);
    } catch (error) {
      toast.error(errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeSubject(id: string) {
    const subject = data.subjects.find((item) => item.id === id);
    if (!window.confirm(`Delete "${subject?.title ?? "this subject"}"? Its notes, cards, plan tasks, and tutor chat will be deleted.`)) return;
    setBusy(true);
    try {
      await deleteSubject({ data: { id } });
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (error) {
      toast.error(errText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-mute">Subjects</p>
          <h1 className="font-display text-3xl leading-none">Subjects</h1>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add subject
        </Button>
      </header>

      {data.subjects.length === 0 ? (
        <Panel className="p-6">
          <h2 className="font-display text-3xl">No subjects yet</h2>
          <p className="mt-2 text-sm text-mute">Each subject has its own notes, cards, plan, and exam date.</p>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <div className="flex flex-col gap-2">
            {data.subjects.map((subject) => {
              const days = daysUntil(subject.targetDate);
              const active = selected?.id === subject.id;
              return (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => setSelectedId(subject.id)}
                  className={`rounded-lg border px-3 py-3 text-left ${active ? "border-brass bg-panel" : "border-line bg-ink"}`}
                >
                  <p className="font-medium">{subject.title}</p>
                  <p className="text-xs text-mute">
                    {days === null ? "No exam date" : days < 0 ? `${Math.abs(days)} days past the exam` : days === 0 ? "Exam today" : `${days} days out`}
                  </p>
                </button>
              );
            })}
          </div>

          {selected && (
            <Panel className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl leading-none">{selected.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm text-mute">{selected.description || "No description yet."}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="line"
                    onClick={() => {
                      setEditing(selected);
                      setOpen(true);
                    }}
                    aria-label="Edit subject"
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => removeSubject(selected.id)} aria-label="Delete subject">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <NoteUpload subjectId={selected.id} />
                <NotePaste subjectId={selected.id} />
              </div>

              <h3 className="mt-6 text-sm text-mute">Notes the tutor can search</h3>
              {notes.length === 0 ? (
                <EmptyLine>No notes yet. Upload a PDF or paste a lecture.</EmptyLine>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {notes.map((note) => (
                    <li key={note.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{note.name}</p>
                        <p className="text-xs text-mute">{note.chunkCount} passages</p>
                      </div>
                      <button
                        type="button"
                        disabled={deletingNoteId === note.id}
                        className="grid h-11 w-11 place-items-center text-mute hover:text-coral"
                        aria-label={`Delete ${note.name}`}
                        onClick={async () => {
                          if (!window.confirm(`Delete "${note.name}" and its passages from tutor search?`)) return;
                          setDeletingNoteId(note.id);
                          try {
                            await deleteNote({ data: { id: note.id } });
                            await refresh();
                          } catch (error) {
                            toast.error(errText(error));
                          } finally {
                            setDeletingNoteId(null);
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      )}

      <SubjectDialog
        open={open}
        busy={busy}
        initial={editing}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        onSave={saveSubject}
      />
    </div>
  );
}

function SubjectDialog({
  open,
  busy,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  busy: boolean;
  initial: Subject | null;
  onClose: () => void;
  onSave: (input: { title: string; description: string; targetDate: string }) => void;
}) {
  return (
    <Modal open={open} title={initial ? "Edit subject" : "New subject"} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSave({
            title: String(form.get("title") ?? ""),
            description: String(form.get("description") ?? ""),
            targetDate: String(form.get("targetDate") ?? ""),
          });
        }}
      >
        <Field label="Name">
          <input name="title" required defaultValue={initial?.title ?? ""} className={fieldClass} placeholder="Organic chemistry" />
        </Field>
        <Field label="What it covers">
          <textarea name="description" defaultValue={initial?.description ?? ""} rows={3} className={`${fieldClass} py-2`} placeholder="Mechanisms, spectroscopy, synthesis." />
        </Field>
        <Field label="Exam date">
          <input name="targetDate" type="date" defaultValue={initial?.targetDate ?? ""} className={fieldClass} />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save subject"}
        </Button>
      </form>
    </Modal>
  );
}

function NoteUpload({ subjectId }: { subjectId: string }) {
  const refresh = useRefreshDesk();
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="rounded-md border border-dashed border-line p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const input = form.elements.namedItem("file");
        const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
        if (!file) {
          toast.error("Choose a file first.");
          return;
        }
        if (file.size > 4_000_000) {
          toast.error("File is larger than 4 MB.");
          return;
        }
        setBusy(true);
        try {
          const base64 = await fileToBase64(file);
          const saved = await ingestNote({ data: { subjectId, name: file.name, mime: file.type, base64 } });
          toast.success(`${saved.name} · ${saved.chunkCount} passages`);
          form.reset();
          await refresh();
        } catch (error) {
          toast.error(errText(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="flex items-center gap-2 text-sm">
        <Upload className="size-4 text-brass" />
        Upload notes
      </p>
      <p className="mt-1 text-xs text-mute">PDF, TXT, or Markdown. Up to 4 MB.</p>
      <input name="file" type="file" accept=".pdf,.txt,.md,.markdown,text/plain,application/pdf" className="mt-3 block w-full text-sm text-mute file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-brass file:px-3 file:font-semibold file:text-on-brass" />
      <Button className="mt-3" type="submit" disabled={busy}>
        {busy ? "Reading…" : "Add to subject"}
      </Button>
    </form>
  );
}

function NotePaste({ subjectId }: { subjectId: string }) {
  const refresh = useRefreshDesk();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="rounded-md border border-line p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          const saved = await ingestText({ data: { subjectId, text, name: "Pasted notes" } });
          toast.success(`${saved.chunkCount} passages saved`);
          setText("");
          await refresh();
        } catch (error) {
          toast.error(errText(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Or paste a lecture">
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} className={`${fieldClass} py-2`} placeholder="Drop the passage you want the tutor to know." />
      </Field>
      <Button className="mt-3" type="submit" disabled={busy || text.trim().length < 40}>
        {busy ? "Saving…" : "Save paste"}
      </Button>
    </form>
  );
}
