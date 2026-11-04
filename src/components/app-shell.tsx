import { useEffect, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, Layers, Library, MessageSquare, Pause, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button, Panel } from "@/components/ui";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/cn";
import { getDueCards } from "@/lib/study/domain";
import { logSession } from "@/lib/study/server";
import { DeskContext, errText, useWorkspaceQuery } from "@/lib/study/use-desk";
import { formatClock, pomoEndEarly, pomoReset, pomoSetSubject, pomoToggle, setPomoLogger, usePomo } from "@/components/pomo";

const NAV = [
  { to: "/", label: "Desk", icon: BookOpen },
  { to: "/subjects", label: "Subjects", icon: Library },
  { to: "/tutor", label: "Tutor", icon: MessageSquare },
  { to: "/cards", label: "Cards", icon: Layers },
  { to: "/plan", label: "Plan", icon: CalendarDays },
] as const;

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 2.5c.7 2.8 2.6 4.6 5.4 5.3-2.8.7-4.7 2.5-5.4 5.3-.7-2.8-2.6-4.6-5.4-5.3C13.4 7.1 15.3 5.3 16 2.5z"
      />
      <rect x="14.2" y="14" width="3.6" height="5.2" rx="0.4" fill="currentColor" />
      <path fill="currentColor" d="M7.5 20.2h17l-1.4 3.2H8.9l-1.4-3.2z" />
      <path fill="currentColor" d="M6 25.2h20v2.1H6z" />
    </svg>
  );
}

export function BootScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-6 text-parchment">
      <div className="flex flex-col items-center gap-3">
        <Mark className="size-10 text-brass" />
        <p className="font-display text-4xl">Lumen</p>
        <p className="text-sm text-mute">Loading…</p>
      </div>
    </div>
  );
}

export function PomoPanel({
  subjects,
  compact = false,
}: {
  subjects: { id: string; title: string }[];
  compact?: boolean;
}) {
  const pomo = usePomo();
  const progress = pomo.total ? Math.round(((pomo.total - pomo.remaining) / pomo.total) * 100) : 0;
  const sessionStarted = pomo.running || pomo.remaining < pomo.total;
  return (
    <div className={cn("rounded-lg border border-line bg-ink", compact ? "p-3" : "p-5")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs tracking-wide text-mute uppercase">{pomo.mode === "focus" ? "Focus 25" : "Break 5"}</p>
        <p className="font-display text-4xl tabular-nums text-parchment">{formatClock(pomo.remaining)}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel">
        <div className={cn("h-full", pomo.mode === "focus" ? "bg-brass" : "bg-sage")} style={{ width: `${progress}%` }} />
      </div>
      <label className="mt-3 flex flex-col gap-1 text-xs text-mute">
        Subject
        <select
          className="min-h-11 w-full rounded-md border border-line bg-panel px-3 pr-10 text-sm text-parchment outline-none focus:border-brass"
          value={pomo.subjectId ?? ""}
          disabled={sessionStarted}
          onChange={(event) => pomoSetSubject(event.target.value || null)}
        >
          <option value="">No subject</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.title}
            </option>
          ))}
        </select>
      </label>
      {sessionStarted && <p className="text-xs text-mute">Reset the timer to change the subject for this session.</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={pomoToggle}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-brass px-3 text-sm font-semibold text-on-brass"
        >
          {pomo.running ? <Pause className="size-4" /> : <Play className="size-4" />}
          {pomo.running ? "Pause" : "Start"}
        </button>
        <button type="button" onClick={pomoReset} aria-label="Reset timer" className="grid h-11 w-11 place-items-center rounded-md border border-line text-mute">
          <RotateCcw className="size-4" />
        </button>
      </div>
      {pomo.mode === "focus" && (pomo.running || pomo.remaining < pomo.total) && (
        <button type="button" onClick={pomoEndEarly} className="mt-2 min-h-11 w-full text-sm text-mute hover:text-parchment">
          End focus and log it
        </button>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const query = useWorkspaceQuery(user?.id);
  const qc = useQueryClient();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const pomo = usePomo();

  useEffect(() => {
    const subjects = query.data?.subjects;
    if (subjects && pomo.subjectId && !subjects.some((subject) => subject.id === pomo.subjectId)) {
      pomoSetSubject(null);
    }
  }, [pomo.subjectId, query.data?.subjects]);

  useEffect(() => {
    setPomoLogger(async ({ minutes, subjectId }) => {
      try {
        await logSession({ data: { subjectId, durationMinutes: minutes, type: "pomodoro" } });
        await qc.invalidateQueries({ queryKey: ["workspace"] });
        toast.success(`Logged ${minutes} min of focus`);
      } catch (error) {
        toast.error(errText(error));
      }
    });
    return () => setPomoLogger(null);
  }, [qc]);

  if (isPending) return <BootScreen />;
  if (!user) return <RedirectToSignIn />;

  const due = query.data ? getDueCards(query.data.flashcards).length : 0;
  const subjects = query.data?.subjects ?? [];

  return (
    <DeskContext.Provider value={query}>
      <div className="min-h-dvh bg-ink text-parchment">
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-ink px-3 py-5 md:flex">
          <Link to="/" className="flex items-center gap-2 px-2">
            <Mark className="size-7 text-brass" />
            <span className="font-display text-3xl leading-none">Lumen</span>
          </Link>
          <p className="mt-1 px-2 text-xs text-mute">Study workspace</p>
          <nav className="mt-6 flex flex-col gap-1">
            {NAV.map((item) => {
              const active = item.to === "/" ? path === "/" : path === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm",
                    active ? "bg-panel text-parchment" : "text-mute hover:bg-panel hover:text-parchment",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/cards" && due > 0 && (
                    <span className="rounded-full bg-brass px-2 py-0.5 text-xs font-semibold text-on-brass">{due}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-3">
            {path !== "/plan" && <PomoPanel subjects={subjects} compact />}
            <div className="px-1">
              <UserButton />
            </div>
          </div>
        </aside>

        <div className="md:pl-60">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur md:hidden">
            <Link to="/" className="flex items-center gap-2">
              <Mark className="size-6 text-brass" />
              <span className="font-display text-2xl leading-none">Lumen</span>
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={pomoToggle}
                aria-label={`${pomo.running ? "Pause" : "Start"} ${pomo.mode} timer, ${formatClock(pomo.remaining)} remaining`}
                title={`${pomo.running ? "Pause" : "Start"} ${pomo.mode} timer`}
                className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm tabular-nums"
              >
                {pomo.running ? <Pause className="mr-2 size-3.5" /> : <Play className="mr-2 size-3.5" />}
                {formatClock(pomo.remaining)}
              </button>
              <UserButton />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10">
            {query.isError && !query.data ? (
              <Panel className="p-6">
                <h1 className="font-display text-2xl">Could not load your study workspace</h1>
                <p className="mt-2 text-sm text-mute">Check your connection, then try again.</p>
                <Button className="mt-4" onClick={() => query.refetch()}>Try again</Button>
              </Panel>
            ) : children}
          </main>
        </div>

        <nav className="dock fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-ink md:hidden">
          {NAV.map((item) => {
            const active = item.to === "/" ? path === "/" : path === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs",
                  active ? "text-brass" : "text-mute",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </DeskContext.Provider>
  );
}
