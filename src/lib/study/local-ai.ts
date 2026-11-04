type ProgressCallback = (progress: number, status: string) => void;
type HistoryMessage = { role: "user" | "assistant"; content: string };

type WorkerResponse =
  | { id: number; type: "progress"; progress: number; status: string }
  | { id: number; type: "ready" }
  | { id: number; type: "result"; text: string }
  | { id: number; type: "error"; error: string };

type PendingRequest = {
  resolve: (value: string | void) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressCallback;
};

let worker: Worker | null = null;
let nextId = 1;
let loadPromise: Promise<void> | null = null;
let loadProgress = 0;
let loadStatus: "idle" | "loading" | "ready" | "error" = "idle";
let lastError: string | null = null;
const pending = new Map<number, PendingRequest>();

function getWorker() {
  if (typeof window === "undefined") throw new Error("Local AI is available in the browser only.");
  if (!worker) {
    worker = new Worker(new URL("./local-ai.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const request = pending.get(message.id);
      if (!request) return;
      if (message.type === "progress") {
        loadProgress = message.progress;
        request.onProgress?.(message.progress, message.status);
      } else {
        pending.delete(message.id);
        if (message.type === "error") request.reject(new Error(message.error));
        else if (message.type === "result") request.resolve(message.text);
        else request.resolve();
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "The local AI worker stopped unexpectedly.");
      for (const request of pending.values()) request.reject(error);
      pending.clear();
      loadStatus = "error";
      lastError = error.message;
      loadPromise = null;
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function requestWorker(type: "load" | "generate", prompt?: string, onProgress?: ProgressCallback) {
  const id = nextId++;
  return new Promise<string | void>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage(type === "load" ? { id, type } : { id, type, prompt });
  });
}

export function getLocalAiStatus() {
  return { progress: loadProgress, status: loadStatus, error: lastError };
}

export async function loadLocalTutor(onProgress?: ProgressCallback): Promise<void> {
  if (loadStatus === "ready") return;
  if (loadPromise) return loadPromise;
  loadStatus = "loading";
  loadProgress = 0;
  lastError = null;
  loadPromise = (async () => {
    try {
      await requestWorker("load", undefined, onProgress);
      loadProgress = 100;
      loadStatus = "ready";
      onProgress?.(100, "ready");
    } catch (error) {
      loadStatus = "error";
      lastError = error instanceof Error ? error.message : String(error);
      loadPromise = null;
      throw new Error(lastError);
    }
  })();
  return loadPromise;
}

function buildPrompt(input: {
  subjectTitle: string;
  description: string;
  history: HistoryMessage[];
  context: { source: string; text: string }[];
  question: string;
}) {
  const hasNotes = input.context.length > 0;
  const notes = hasNotes
    ? input.context
        .slice(0, 3)
        .map((c, i) => `[${i + 1}] (${c.source})\n${c.text.slice(0, 450)}`)
        .join("\n\n")
    : "(no matching notes)";

  // Tiny local models hallucinate hard if allowed free general knowledge.
  // Force them to stay on the uploaded notes.
  const system = hasNotes
    ? [
        `You are Lumen, a careful study tutor for "${input.subjectTitle}".`,
        input.description ? `Subject context: ${input.description.slice(0, 160)}` : "",
        "RULES:",
        "- Answer ONLY using the Notes below. Do not invent facts, dates, countries, or wars that are not in the notes.",
        "- If the notes do not contain the answer, say exactly: \"I don't see that in your notes. Try uploading more material or rephrasing.\"",
        "- Be concise (under 90 words). Prefer short factual sentences.",
        "- Cite note numbers like [1] when you use them.",
        "- Do not end with a quiz question.",
        "",
        "Notes:",
        notes,
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `You are Lumen, a study tutor for "${input.subjectTitle}".`,
        "The student has not uploaded matching notes for this question.",
        "Reply in one short sentence: ask them to upload notes or paste the relevant text, and do not invent historical or scientific facts.",
      ].join("\n");

  let prompt = `<|im_start|>system\n${system}<|im_end|>\n`;
  for (const message of input.history.slice(-2)) {
    prompt += `<|im_start|>${message.role}\n${message.content.slice(0, 280)}<|im_end|>\n`;
  }
  return `${prompt}<|im_start|>user\n${input.question.slice(0, 600)}<|im_end|>\n<|im_start|>assistant\n`;
}

export async function localTutorReply(input: {
  subjectTitle: string;
  description: string;
  history: HistoryMessage[];
  context: { source: string; text: string }[];
  question: string;
}): Promise<string> {
  await loadLocalTutor();
  const result = await requestWorker("generate", buildPrompt(input));
  if (typeof result !== "string" || !result.trim()) throw new Error("The local model returned an empty reply.");
  return result;
}

export function isLocalAiReady() {
  return loadStatus === "ready";
}

export function resetLocalAi() {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) request.reject(new Error("Local AI was reset."));
  pending.clear();
  loadPromise = null;
  loadProgress = 0;
  loadStatus = "idle";
  lastError = null;
}
