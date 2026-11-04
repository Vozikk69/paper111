type ProgressCallback = (progress: number, status: string) => void;
type HistoryMessage = { role: "user" | "assistant"; content: string };

const HAN_CHARACTER = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const CONTENT_STOP_WORDS = new Set(
  "the a an and or but of to in on for with from into over under between about your their there where when what which while because also such through does did was were are is has have had been being will can could would should not its then than more most less very often some many each per any without within using used use according это эта этот эти как где когда который которая которые что или но из в на для по про над под между без при быть был была были есть будут можно их её его они мы вы это те такие также которые як яка яке які що або але і й в на для з про до від у без при під над між це ці той та були є буде можна їх її він вона воно ми ви вони такі також".split(
    " ",
  ),
);

function tutorLanguage(question: string) {
  const cyrillic = (question.match(/[\u0400-\u04FF]/g) ?? []).length;
  const latin = (question.match(/[a-z]/gi) ?? []).length;
  const han = [...question].filter((character) => HAN_CHARACTER.test(character)).length;
  if (han > latin) return "Chinese";
  if (cyrillic > latin) return /[іїєґ]/i.test(question) ? "Ukrainian" : "Russian";
  return "English";
}

function asksForChineseTranslation(question: string) {
  return /\bin\s+chinese\b|\bchinese\s+translation\b|\btranslate\b.{0,50}\b(chinese|mandarin)\b|\bhow\s+to\s+say\b.{0,50}\b(chinese|mandarin)\b|中文|汉字|翻译/i.test(question);
}

function hasUnexpectedChinese(question: string, reply: string) {
  if (tutorLanguage(question) === "Chinese" || asksForChineseTranslation(question)) return false;
  const askedCharacters = new Set([...question].filter((character) => HAN_CHARACTER.test(character)));
  return [...reply].some((character) => HAN_CHARACTER.test(character) && !askedCharacters.has(character));
}

function noNotesReply(question: string) {
  const language = tutorLanguage(question);
  if (language === "Ukrainian") {
    return "У нотатках цього предмета немає матеріалу для надійної відповіді. Додайте відповідну нотатку або вставте текст, і я відповім за ним.";
  }
  if (language === "Russian") {
    return "В заметках этого предмета нет материала для надёжного ответа. Добавьте подходящую заметку или вставьте текст, и я отвечу по нему.";
  }
  if (language === "Chinese") {
    return "当前科目的笔记中没有足够的相关内容。请添加相关笔记或粘贴材料，我会根据材料回答。";
  }
  return "I don’t see relevant notes for that question. Add a note or paste the material, and I’ll answer from it.";
}

function unclearReply(question: string) {
  const language = tutorLanguage(question);
  if (language === "Ukrainian") return "Не вдалося підготувати зрозумілу відповідь українською. Перефразуйте запитання або додайте відповідний матеріал у нотатки.";
  if (language === "Russian") return "Не удалось подготовить понятный ответ на русском. Переформулируйте вопрос или добавьте подходящий материал в заметки.";
  if (language === "Chinese") return "我无法用中文生成清晰的回答。请换一种方式提问，或在笔记中添加相关材料。";
  return "I couldn’t produce a clear English answer. Please rephrase the question or add relevant material to your notes.";
}

function unsupportedReply(question: string) {
  const language = tutorLanguage(question);
  if (language === "Ukrainian") return "Я не можу підтвердити цю відповідь за вашими нотатками. Додайте відповідний матеріал або запитайте про конкретний факт із нього.";
  if (language === "Russian") return "Я не могу подтвердить этот ответ по вашим заметкам. Добавьте подходящий материал или спросите о конкретном факте из него.";
  if (language === "Chinese") return "我无法从你的笔记中确认这个答案。请添加相关材料，或询问笔记中的具体内容。";
  return "I can’t verify that answer from your notes. Add relevant material or ask about a specific fact in it.";
}

function contentTerms(text: string) {
  return new Set(
    (text.toLowerCase().match(/[\p{L}]{3,}/gu) ?? []).filter((word) => !CONTENT_STOP_WORDS.has(word)),
  );
}

function answerIsSupported(reply: string, context: { text: string }[]) {
  const answerTerms = contentTerms(reply);
  if (answerTerms.size === 0) return false;
  const noteTerms = contentTerms(context.map((chunk) => chunk.text).join(" "));
  let matches = 0;
  for (const word of answerTerms) if (noteTerms.has(word)) matches += 1;
  return matches >= Math.min(2, answerTerms.size) && matches / answerTerms.size >= 0.2;
}

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
        `- Reply entirely in ${tutorLanguage(input.question)}. Do not mix in unrelated languages or scripts.`,
        input.description ? `Subject context: ${input.description.slice(0, 160)}` : "",
        "RULES:",
        "- Answer ONLY using the Notes below. Do not invent facts, dates, countries, or wars that are not in the notes.",
        "- If the notes do not contain the answer, say exactly: \"I don't see relevant notes for that question. Add a note or paste the material, and I'll answer from it.\"",
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
  // A tiny local model invents answers when it has no relevant source to use.
  if (input.context.length === 0) return noNotesReply(input.question);
  await loadLocalTutor();
  const result = await requestWorker("generate", buildPrompt(input));
  if (typeof result !== "string" || !result.trim()) throw new Error("The local model returned an empty reply.");
  if (hasUnexpectedChinese(input.question, result)) return unclearReply(input.question);
  if (!answerIsSupported(result, input.context)) return unsupportedReply(input.question);
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
