import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Flame, Layers, Target } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button, EmptyLine, Meter, Panel } from "@/components/ui";
import {
  computeReadiness,
  computeStreak,
  computeWeeklyHours,
  daysUntil,
  formatRelativeDue,
  getDueCards,
  todayKey,
} from "@/lib/study/domain";
import { seedDesk } from "@/lib/study/server";
import { errText, useDesk, useRefreshDesk } from "@/lib/study/use-desk";

export function DeskView() {
  const query = useDesk();
  const refresh = useRefreshDesk();
  const [mounted, setMounted] = useState(false);
  const [seeding, setSeeding] = useState(false);
  useEffect(() => setMounted(true), []);

  if (query.isLoading || !query.data) {
    return <p className="text-mute">Loading…</p>;
  }
  if (query.isError) {
    return (
      <Panel className="p-6">
        <p>Could not load workspace.</p>
        <Button className="mt-4" onClick={() => query.refetch()}>
          Try again
        </Button>
      </Panel>
    );
  }

  const data = query.data;
  const streak = computeStreak(data.sessions);
  const weekly = computeWeeklyHours(data.sessions);
  const readiness = computeReadiness(data.flashcards, data.tasks);
  const due = getDueCards(data.flashcards);
  const today = todayKey();
  const todayTasks = data.tasks.filter((task) => !task.isCompleted && task.dueDate <= today);
  const subjects = new Map(data.subjects.map((subject) => [subject.id, subject]));
  const nextExam = data.subjects
    .map((subject) => ({ subject, days: daysUntil(subject.targetDate) }))
    .filter((item): item is { subject: (typeof data.subjects)[number]; days: number } => item.days !== null && item.days >= 0)
    .sort((a, b) => a.days - b.days)[0];

  async function loadSample() {
    setSeeding(true);
    try {
      await seedDesk();
      await refresh();
      toast.success("Sample data loaded");
    } catch (error) {
      toast.error(errText(error));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-mute">Dashboard</p>
          <h1 className="font-display text-3xl leading-none text-parchment">Lumen</h1>
          <p className="mt-2 max-w-xl text-sm text-mute">
            {nextExam
              ? `${nextExam.subject.title} is ${nextExam.days === 0 ? "today" : `in ${nextExam.days} day${nextExam.days === 1 ? "" : "s"}`}.`
              : "Streak, hours, and what is due before the exam."}
          </p>
        </div>
        <Link to="/plan" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-semibold">
          Plan the exam
          <ArrowRight className="size-4" />
        </Link>
      </header>

      {data.subjects.length === 0 && (
        <Panel className="p-6">
          <h2 className="font-display text-3xl">No subjects yet</h2>
          <p className="mt-2 max-w-xl text-sm text-mute">
            Add a subject to get started, or load sample data to explore the app.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/subjects" className="inline-flex min-h-11 items-center rounded-md bg-brass px-4 text-sm font-semibold text-on-brass">
              Add a subject
            </Link>
            <Button variant="line" disabled={seeding} onClick={loadSample}>
              {seeding ? "Loading sample…" : "Load sample data"}
            </Button>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Flame className="size-4 text-brass" />}
          label="Streak"
          value={`${streak.streak} ${streak.streak === 1 ? "day" : "days"}`}
          hint={streak.studiedToday ? "You already studied today" : "One session keeps it alive"}
        />
        <Stat icon={<Clock className="size-4 text-sage" />} label="This week" value={`${weekly.totalHours} h`} hint="Chat, cards, and focus blocks" />
        <Stat
          icon={<Target className="size-4 text-brass" />}
          label="Readiness"
          value={`${readiness.score}%`}
          hint={
            readiness.totalCards + readiness.totalTasks === 0
              ? "Add cards and a plan to score it"
              : `${readiness.mastered}/${readiness.totalCards} cards mastered · ${readiness.completed}/${readiness.totalTasks} tasks`
          }
          meter={readiness.score}
        />
        <Stat icon={<Layers className="size-4 text-sage" />} label="Cards due" value={String(due.length)} hint={due.length ? "Due for review" : "Nothing overdue"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="p-5 lg:col-span-3">
          <h2 className="font-display text-2xl">Hours this week</h2>
          <p className="text-sm text-mute">Seven days, all session types.</p>
          <div className="mt-4 h-56 w-full min-w-0">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly.data} barCategoryGap="28%">
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--color-mute)", fontSize: 12 }} />
                  <YAxis hide domain={[0, (max: number) => Math.max(1, max)]} />
                  <Tooltip
                    cursor={{ fill: "rgba(243,234,220,0.05)" }}
                    contentStyle={{
                      background: "var(--color-ink)",
                      border: "1px solid var(--color-line)",
                      borderRadius: 12,
                      color: "var(--color-parchment)",
                    }}
                  />
                  <Bar dataKey="hours" fill="var(--color-brass)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full rounded-md bg-ink" />
            )}
          </div>
        </Panel>

        <Panel className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Due now</h2>
              <p className="text-sm text-mute">Overdue and due today.</p>
            </div>
            {due.length > 0 && (
              <Link to="/cards" search={{ review: true }} className="inline-flex min-h-11 items-center gap-1 text-sm text-brass">
                Review <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
          {due.length === 0 ? (
            <EmptyLine>No cards due. The interval is doing its job.</EmptyLine>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {due.slice(0, 6).map((card) => (
                <li key={card.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{card.frontText}</p>
                    <p className="text-xs text-mute">{subjects.get(card.subjectId)?.title ?? "Subject"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-ink px-2 py-1 text-xs text-coral">{formatRelativeDue(card.nextReviewDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Open work</h2>
            <p className="text-sm text-mute">Tasks due today or earlier.</p>
          </div>
          <Link to="/plan" className="text-sm text-brass">
            Open plan
          </Link>
        </div>
        {todayTasks.length === 0 ? (
          <EmptyLine>{data.tasks.length ? "Nothing overdue. Later days are still on the plan." : "No tasks yet. Build a plan from an exam date."}</EmptyLine>
        ) : (
          <ul className="mt-3 grid gap-2">
            {todayTasks.slice(0, 6).map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 rounded-md bg-ink px-3 py-3">
                <span className="min-w-0 truncate text-sm">{task.title}</span>
                <span className="shrink-0 text-xs text-mute">{subjects.get(task.subjectId)?.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  meter,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  meter?: number;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-xs text-mute">
        {icon}
        {label}
      </div>
      <p className="mt-2 font-display text-2xl leading-none tabular-nums">{value}</p>
      <p className="mt-2 text-xs text-mute">{hint}</p>
      {meter !== undefined && (
        <div className="mt-3">
          <Meter value={meter} label="Readiness" />
        </div>
      )}
    </Panel>
  );
}
