export type Subject = {
  id: string;
  title: string;
  description: string;
  targetDate: string | null;
  createdAt: string;
};

export type SessionType = "chat" | "cards" | "pomodoro";

export type StudySession = {
  id: string;
  subjectId: string | null;
  durationMinutes: number;
  type: SessionType;
  createdAt: string;
};

export type Flashcard = {
  id: string;
  subjectId: string;
  frontText: string;
  backText: string;
  easinessFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  subjectId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export type PlanTask = {
  id: string;
  subjectId: string;
  title: string;
  dueDate: string;
  isCompleted: boolean;
};

export type NoteDoc = {
  id: string;
  subjectId: string;
  name: string;
  chunkCount: number;
  createdAt: string;
};

export type Workspace = {
  subjects: Subject[];
  sessions: StudySession[];
  flashcards: Flashcard[];
  messages: ChatMessage[];
  tasks: PlanTask[];
  notes: NoteDoc[];
};

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

export const REVIEW_BUTTONS: { label: string; quality: ReviewQuality; hint: string }[] = [
  { label: "Again", quality: 1, hint: "Forgot it" },
  { label: "Hard", quality: 3, hint: "Took effort" },
  { label: "Good", quality: 4, hint: "Remembered" },
  { label: "Easy", quality: 5, hint: "Instant recall" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
export const MASTERED_INTERVAL_DAYS = 6;

export function applySm2(
  card: Pick<Flashcard, "easinessFactor" | "interval" | "repetitions">,
  quality: ReviewQuality,
  now: Date = new Date(),
) {
  let { easinessFactor, interval, repetitions } = card;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.max(1, Math.round(interval * easinessFactor));
  }
  const delta = 5 - quality;
  easinessFactor = Math.max(1.3, easinessFactor + (0.1 - delta * (0.08 + delta * 0.02)));
  easinessFactor = Math.round(easinessFactor * 100) / 100;
  return {
    easinessFactor,
    interval,
    repetitions,
    nextReviewDate: new Date(now.getTime() + interval * DAY_MS).toISOString(),
  };
}

export function previewInterval(
  card: Pick<Flashcard, "easinessFactor" | "interval" | "repetitions">,
  quality: ReviewQuality,
) {
  const { interval } = applySm2(card, quality);
  if (interval <= 1) return "1 day";
  return `${interval} days`;
}

export function isDue(card: Flashcard, now: Date = new Date()) {
  return new Date(card.nextReviewDate).getTime() <= now.getTime();
}

export function isMastered(card: Flashcard) {
  return card.interval >= MASTERED_INTERVAL_DAYS;
}

export function toDayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayKey(now: Date = new Date()) {
  return toDayKey(now);
}

export function computeStreak(sessions: StudySession[], now: Date = new Date()) {
  const days = new Set(sessions.map((session) => toDayKey(new Date(session.createdAt))));
  const cursor = new Date(now);
  if (!days.has(toDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(toDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak, studiedToday: days.has(toDayKey(now)) };
}

export function computeWeeklyHours(sessions: StudySession[], now: Date = new Date()) {
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - index));
    return { key: toDayKey(date), day: date.toLocaleDateString(undefined, { weekday: "short" }), minutes: 0 };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const session of sessions) {
    const bucket = byKey.get(toDayKey(new Date(session.createdAt)));
    if (bucket) bucket.minutes += session.durationMinutes;
  }
  const data = buckets.map((bucket) => ({
    day: bucket.day,
    hours: Math.round((bucket.minutes / 60) * 10) / 10,
  }));
  const totalHours = Math.round(data.reduce((sum, item) => sum + item.hours, 0) * 10) / 10;
  return { data, totalHours };
}

export function computeReadiness(flashcards: Flashcard[], tasks: PlanTask[]) {
  const mastered = flashcards.filter(isMastered).length;
  const completed = tasks.filter((task) => task.isCompleted).length;
  const cardRatio = flashcards.length ? mastered / flashcards.length : null;
  const taskRatio = tasks.length ? completed / tasks.length : null;
  const parts = [cardRatio, taskRatio].filter((value): value is number => value !== null);
  const score = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : 0;
  return { score, mastered, totalCards: flashcards.length, completed, totalTasks: tasks.length };
}

export function getDueCards(flashcards: Flashcard[], now: Date = new Date()) {
  return flashcards
    .filter((card) => isDue(card, now))
    .sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime());
}

export function formatRelativeDue(iso: string, now: Date = new Date()) {
  const diffDays = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
  if (diffDays <= 0) return "Due today";
  if (diffDays === 1) return "1 day overdue";
  return `${diffDays} days overdue`;
}

export function formatCardDue(card: Flashcard, now: Date = new Date()) {
  if (isDue(card, now)) return formatRelativeDue(card.nextReviewDate, now);
  const days = Math.ceil((new Date(card.nextReviewDate).getTime() - now.getTime()) / DAY_MS);
  if (days <= 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export function daysUntil(date: string | null, now: Date = new Date()) {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - start.getTime()) / DAY_MS);
}

const STOPWORDS = new Set(
  "the a an and or but of to in on for with is are was were be been it this that these those as at by from what which who how why when where can do does did i you we they he she its their our your about into than then so if not no yes explain tell me give".split(
    " ",
  ),
);

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function chunkText(text: string, size = 900, overlap = 150) {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const breakAt = Math.max(clean.lastIndexOf("\n", end), clean.lastIndexOf(". ", end));
      if (breakAt > start + size / 2) end = breakAt + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

export type RetrievedChunk = { source: string; text: string };

export function retrieveRelevantChunks(
  query: string,
  notes: { source: string; text: string }[],
  limit = 4,
): RetrievedChunk[] {
  const queryTokens = Array.from(new Set(tokenize(query)));
  const all = notes.map((note) => ({ ...note, tokens: tokenize(note.text) }));
  if (!all.length) return [];
  if (!queryTokens.length) return all.slice(0, limit).map(({ source, text }) => ({ source, text }));
  const documentFrequency = new Map<string, number>();
  for (const chunk of all) {
    for (const token of new Set(chunk.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const scored = all.map((chunk) => {
    const termCounts = new Map<string, number>();
    for (const token of chunk.tokens) termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
    let score = 0;
    for (const token of queryTokens) {
      const tf = termCounts.get(token) ?? 0;
      if (!tf) continue;
      const idf = Math.log(1 + all.length / (documentFrequency.get(token) ?? 1));
      score += (tf / (tf + 1.2)) * idf;
    }
    return { source: chunk.source, text: chunk.text, score };
  });
  const hits = scored.filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score);
  const chosen = (hits.length ? hits : scored).slice(0, limit);
  return chosen.map(({ source, text }) => ({ source, text }));
}

function parseDay(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function fmtDay(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function eachDay(start: string, end: string) {
  const days: string[] = [];
  const cursor = parseDay(start);
  const last = parseDay(end);
  while (cursor <= last && days.length < 130) {
    days.push(fmtDay(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function isDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function draftPlan(input: {
  title: string;
  description: string;
  topics: string;
  today: string;
  examDate: string;
  hoursPerDay: number;
}) {
  const days = eachDay(input.today, input.examDate);
  if (!days.length) return [];
  const perDay = input.hoursPerDay >= 2.5 ? 3 : input.hoursPerDay >= 1.5 ? 2 : 1;
  const rawTopics = input.topics
    .split(/\n|,/)
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 1);
  const topics = rawTopics.length
    ? rawTopics
    : [
        `Skim the map of ${input.title}`,
        input.description ? "Turn the description into a one-page outline" : `List the core ideas in ${input.title}`,
        "Work a first set of practice problems",
        "Re-teach the hardest idea out loud",
        "Mixed practice from earlier topics",
      ];
  const workDays = days.length > 2 ? days.slice(0, -2) : days.slice(0, -1);
  const reviewDay = days.length > 2 ? days[days.length - 2] : null;
  const finalStudyDay = days.length > 1 ? days[days.length - 2] : days[0];
  const tasks: { title: string; dueDate: string }[] = [];
  let topicIndex = 0;
  for (const day of workDays) {
    for (let slot = 0; slot < perDay && tasks.length < 36; slot += 1) {
      const topic = topics[topicIndex % topics.length];
      const pass = Math.floor(topicIndex / topics.length);
      const title =
        pass === 0 ? `Study: ${topic}` : pass === 1 ? `Practice problems — ${topic}` : `Recall from memory — ${topic}`;
      tasks.push({ title: title.slice(0, 180), dueDate: day });
      topicIndex += 1;
    }
  }
  if (reviewDay) tasks.push({ title: `Mixed review of ${input.title}`.slice(0, 180), dueDate: reviewDay });
  if (finalStudyDay) {
    const title = days.length > 1 ? `Timed practice exam — ${input.title}` : `Quick recall and exam prep — ${input.title}`;
    tasks.push({ title: title.slice(0, 180), dueDate: finalStudyDay });
  }
  return tasks.slice(0, 40);
}
