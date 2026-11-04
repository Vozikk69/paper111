import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button, Panel, fieldClass, selectClass } from "@/components/ui";
import {
  cardFromReply,
  clearChat,
  prepareTutorContext,
  saveTutorExchange,
} from "@/lib/study/server";
import { errText, useDesk, useRefreshDesk } from "@/lib/study/use-desk";
import {
  loadLocalTutor,
  localTutorReply,
} from "@/lib/study/local-ai";

export function TutorView() {
  const query = useDesk();
  const refresh = useRefreshDesk();
  const [subjectId, setSubjectId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modelError, setModelError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const subjects = query.data?.subjects ?? [];
  const activeId = subjects.some((subject) => subject.id === subjectId) ? subjectId : subjects[0]?.id || "";
  const messages = (query.data?.messages ?? []).filter((message) => message.subjectId === activeId);
  const noteCount = (query.data?.notes ?? []).filter((note) => note.subjectId === activeId).length;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length, busy]);

  // Download and initialize the local model on opening the tutor.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setModelStatus("loading");
        setModelError(null);
        await loadLocalTutor((p, status) => {
          if (cancelled) return;
          setModelProgress(p);
          if (status === "ready") setModelStatus("ready");
        });
        if (!cancelled) {
          setModelStatus("ready");
          setModelProgress(100);
        }
      } catch (err) {
        if (!cancelled) {
          setModelStatus("error");
          const msg = err instanceof Error ? err.message : String(err);
          setModelError(msg);
          toast.error("Local model could not start. Open the app in a regular browser tab and try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (query.isLoading || !query.data) return <p className="text-mute">Loading tutor…</p>;

  async function sendLocal() {
    const content = text.trim();
    if (!content || !activeId || busy) return;
    setText("");
    setBusy(true);
    // Let React paint the "Thinking…" state before WASM blocks the thread.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
      const ctx = await prepareTutorContext({ data: { subjectId: activeId, content } });
      const reply = await localTutorReply({
        subjectTitle: ctx.subjectTitle,
        description: ctx.description,
        history: ctx.history,
        context: ctx.context,
        question: ctx.question,
      });
      await saveTutorExchange({
        data: { subjectId: activeId, question: content, reply },
      });
      await refresh();
    } catch (error) {
      setText(content);
      toast.error(errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    // Source-only answers and no-notes replies do not need the model to finish loading.
    await sendLocal();
  }

  return (
    <div className="flex min-h-[70dvh] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-mute">Tutor</p>
          <h1 className="font-display text-3xl leading-none">AI Tutor</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {subjects.length > 0 && (
            <label className="text-sm text-mute">
              Subject
              <select
                className={`${selectClass} mt-1 min-w-48`}
                value={activeId}
                onChange={(event) => setSubjectId(event.target.value)}
              >
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </header>

      {modelStatus !== "ready" && (
        <Panel className="flex items-center gap-3 p-3 text-sm">
          {modelStatus === "loading" ? (
            <>
              <Download className="size-4 animate-pulse text-brass" />
              <div className="flex-1">
                <p className="text-mute">Downloading local model (Qwen1.5-0.5B)… {modelProgress}%</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
                  <div
                    className="h-full rounded-full bg-brass transition-all duration-300"
                    style={{ width: `${modelProgress}%` }}
                  />
                </div>
              </div>
            </>
          ) : modelStatus === "error" ? (
            <div className="flex flex-col gap-1 text-mute">
              <p>Local model unavailable{modelError ? `: ${modelError}` : "."}</p>
              <p className="text-xs">
                No API key is used. Open the app in a regular browser tab, check that WebAssembly is enabled, and retry.
              </p>
            </div>
          ) : (
            <p className="text-mute">Preparing local model…</p>
          )}
        </Panel>
      )}

      {subjects.length === 0 ? (
        <Panel className="p-6 text-center">
          <p className="text-mute">Add a subject first, then come back to chat with the tutor.</p>
          <Link to="/subjects" className="mt-3 inline-block text-brass underline">
            Go to subjects
          </Link>
        </Panel>
      ) : noteCount === 0 && messages.length === 0 ? (
        <Panel className="p-6 text-center">
          <p className="text-mute">
            Add notes for this subject so the tutor can answer from your material. Without a relevant note, it will ask you to provide context.
          </p>
        </Panel>
      ) : null}

      {subjects.length > 0 && (
        <Panel className="flex min-h-[50dvh] flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <p className="text-xs text-mute">
              {modelStatus === "ready"
                ? "Tutor ready"
                : "Preparing tutor…"}
            </p>
            {messages.length > 0 && (
              <button
                type="button"
                disabled={busy || clearing}
                className="flex items-center gap-1 text-xs text-mute hover:text-parchment disabled:opacity-50"
                onClick={async () => {
                  if (!window.confirm("Clear this subject’s tutor conversation? This cannot be undone.")) return;
                  setClearing(true);
                  try {
                    await clearChat({ data: { subjectId: activeId } });
                    await refresh();
                    toast.success("Chat cleared");
                  } catch (error) {
                    toast.error(errText(error));
                  } finally {
                    setClearing(false);
                  }
                }}
              >
                <Trash2 className="size-3.5" />
                {clearing ? "Clearing…" : "Clear"}
              </button>
            )}
          </div>
          <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {messages.length === 0 && !busy && (
              <p className="m-auto max-w-sm text-center text-sm text-mute">
                Ask for an explanation, a worked example, or a check question. Replies can become cards.
              </p>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={message.role === "user" ? "ml-auto max-w-[40rem]" : "max-w-[40rem]"}
              >
                <div
                  className={
                    message.role === "user"
                      ? "rounded-lg bg-brass px-4 py-3 text-on-brass"
                      : "rounded-lg bg-ink px-4 py-3"
                  }
                >
                  {message.role === "assistant" ? (
                    <div className="tutor-md text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
                {message.role === "assistant" && (
                  <button
                    type="button"
                    className="mt-1 min-h-11 text-xs text-brass disabled:opacity-50"
                    disabled={savingId === message.id}
                    onClick={async () => {
                      setSavingId(message.id);
                      try {
                        await cardFromReply({ data: { messageId: message.id } });
                        await refresh();
                        toast.success("Saved to your cards");
                      } catch (error) {
                        toast.error(errText(error));
                      } finally {
                        setSavingId(null);
                      }
                    }}
                  >
                    {savingId === message.id ? "Making a card…" : "Save as card"}
                  </button>
                )}
              </div>
            ))}
            {busy && (
              <p className="text-sm text-mute">
                {modelStatus === "ready" ? "Thinking locally…" : "Reading the notes…"}
              </p>
            )}
          </div>
          <form
            className="flex items-end gap-2 border-t border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="Ask about a lecture, a problem, or a term."
              className={`${fieldClass} max-h-40 py-2`}
            />
            <Button type="submit" disabled={busy || !text.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </Panel>
      )}
    </div>
  );
}
