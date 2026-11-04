/// <reference lib="webworker" />
import { pipeline, env } from "@huggingface/transformers";

type ProgressInfo = { status?: string; progress?: number; file?: string };
type Incoming =
  | { id: number; type: "load" }
  | { id: number; type: "generate"; prompt: string };

// Models are fetched from Hugging Face once and then reused from the browser cache.
env.allowLocalModels = false;
env.useBrowserCache = true;
env.allowRemoteModels = true;
// Keep inference off the UI thread and use the most compatible WASM mode.
try {
  const wasm = (env as any).backends?.onnx?.wasm;
  if (wasm) {
    wasm.proxy = false;
    wasm.numThreads = 1;
  }
} catch {
  // Backend configuration differs slightly between Transformers.js releases.
}

let generator: any = null;
let loading: Promise<any> | null = null;

async function getGenerator(id: number) {
  if (generator) return generator;
  if (!loading) {
    loading = pipeline("text-generation", "Xenova/Qwen1.5-0.5B-Chat", {
      dtype: "q4",
      progress_callback: (info: ProgressInfo) => {
        self.postMessage({
          id,
          type: "progress",
          progress: typeof info.progress === "number" ? Math.min(99, Math.round(info.progress)) : 0,
          status: info.status ?? "download",
          file: info.file,
        });
      },
    }).then((pipe) => {
      generator = pipe;
      return pipe;
    }).catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

self.addEventListener("message", async (event: MessageEvent<Incoming>) => {
  const message = event.data;
  try {
    const gen = await getGenerator(message.id);
    if (message.type === "load") {
      self.postMessage({ id: message.id, type: "ready" });
      return;
    }
    const output = await gen(message.prompt, {
      max_new_tokens: 140,
      temperature: 0.1,
      do_sample: false,
      return_full_text: false,
    });
    const first = Array.isArray(output) ? output[0] : output;
    const raw = first && typeof first === "object" && "generated_text" in first
      ? String(first.generated_text)
      : String(first ?? "");
    const text = raw
      .replace(/<\|im_end\|>/g, "")
      .replace(/<\|im_start\|>/g, "")
      .replace(/^\s*assistant\s*/i, "")
      .trim();
    if (!text) throw new Error("The local model returned an empty reply. Please try again.");
    self.postMessage({ id: message.id, type: "result", text: text.slice(0, 4000) });
  } catch (error) {
    self.postMessage({
      id: message.id,
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
