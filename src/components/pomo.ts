import { useEffect, useSyncExternalStore } from "react";

export type PomoState = {
  mode: "focus" | "break";
  remaining: number;
  total: number;
  running: boolean;
  subjectId: string | null;
  endsAt: number | null;
};

const FOCUS = 25 * 60;
const BREAK = 5 * 60;
const STORAGE_KEY = "lumen:pomodoro:v1";

const INITIAL: PomoState = {
  mode: "focus",
  remaining: FOCUS,
  total: FOCUS,
  running: false,
  subjectId: null,
  endsAt: null,
};

let state: PomoState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let restored = false;

type Logger = (info: { minutes: number; subjectId: string | null }) => void;
let logger: Logger | null = null;

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The timer remains usable when browser storage is unavailable.
  }
}

function emit() {
  persist();
  for (const listener of listeners) listener();
}

function restore() {
  if (restored || typeof window === "undefined") return;
  restored = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<PomoState>;
    if (
      (saved.mode !== "focus" && saved.mode !== "break") ||
      typeof saved.remaining !== "number" ||
      typeof saved.total !== "number" ||
      typeof saved.running !== "boolean"
    ) {
      return;
    }
    const endsAt = typeof saved.endsAt === "number" && Number.isFinite(saved.endsAt) ? saved.endsAt : null;
    state = {
      mode: saved.mode,
      remaining: Math.max(0, Math.min(saved.remaining, saved.total)),
      total: Math.max(1, saved.total),
      running: saved.running && endsAt !== null,
      subjectId: typeof saved.subjectId === "string" ? saved.subjectId : null,
      endsAt,
    };
  } catch {
    state = INITIAL;
  }
}

function advanceTo(now: number) {
  if (!state.running || state.endsAt === null) return;
  let next = state;

  // Carry elapsed time across a delayed browser tick or a tab that was asleep.
  while (next.running && next.endsAt !== null && next.endsAt <= now) {
    const boundary = next.endsAt;
    if (next.mode === "focus") {
      logger?.({ minutes: Math.max(1, Math.round(next.total / 60)), subjectId: next.subjectId });
      next = {
        ...next,
        mode: "break",
        remaining: BREAK,
        total: BREAK,
        running: true,
        endsAt: boundary + BREAK * 1000,
      };
    } else {
      next = {
        ...next,
        mode: "focus",
        remaining: FOCUS,
        total: FOCUS,
        running: false,
        endsAt: null,
      };
    }
  }

  if (next.running && next.endsAt !== null) {
    next = { ...next, remaining: Math.max(0, Math.ceil((next.endsAt - now) / 1000)) };
  }
  if (next !== state) {
    state = next;
    emit();
  }
}

function startTimer() {
  if (timer !== null || typeof window === "undefined") return;
  timer = setInterval(() => advanceTo(Date.now()), 1000);
}

export function setPomoLogger(next: Logger | null) {
  logger = next;
}

export function pomoToggle() {
  advanceTo(Date.now());
  if (state.running) {
    state = { ...state, remaining: Math.max(0, state.remaining), running: false, endsAt: null };
  } else {
    state = { ...state, running: true, endsAt: Date.now() + state.remaining * 1000 };
    startTimer();
  }
  emit();
}

export function pomoReset() {
  const total = state.mode === "focus" ? FOCUS : BREAK;
  state = { ...state, remaining: total, total, running: false, endsAt: null };
  emit();
}

export function pomoEndEarly() {
  advanceTo(Date.now());
  if (state.mode !== "focus") return;
  const subjectId = state.subjectId;
  const minutes = Math.floor((state.total - state.remaining) / 60);
  state = { ...state, mode: "focus", remaining: FOCUS, total: FOCUS, running: false, endsAt: null };
  emit();
  if (minutes >= 1) logger?.({ minutes, subjectId });
}

export function pomoSetSubject(subjectId: string | null) {
  advanceTo(Date.now());
  if ((state.running || state.remaining < state.total) && subjectId !== null) return;
  state = { ...state, subjectId };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePomo() {
  useEffect(() => {
    restore();
    if (state.running) startTimer();
    for (const listener of listeners) listener();
  }, []);
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}

export function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
