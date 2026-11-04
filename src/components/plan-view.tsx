import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PomoPanel } from "@/components/app-shell";
import { Button, EmptyLine, Field, Modal, Panel, fieldClass, selectClass } from "@/components/ui";
import { todayKey, type PlanTask } from "@/lib/study/domain";
import { addTask, deleteTask, generatePlan, toggleTask } from "@/lib/study/server";
import { errText, useDesk, useRefreshDesk } from "@/lib/study/use-desk";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type PlanInput = {
  subjectId: string;
  topics: string;
  examDate: string;
  today: string;
  hoursPerDay: number;
};

function dayLabel(value: string, today: string) {
  if (value < today) return "Overdue";
  if (value === today) return "Today";
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS[date.getMonth()]}`;
}

export function PlanView() {
  const query = useDesk();
  const refresh = useRefreshDesk();
  const [subjectId, setSubjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [taskActionId, setTaskActionId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pendingPlan, setPendingPlan] = useState<PlanInput | null>(null);

  if (query.isLoading || !query.data) return <p className="text-mute">Loading plan…</p>;
  const data = query.data;
  const subjects = data.subjects;
  const activeId = subjects.some((item) => item.id === subjectId) ? subjectId : subjects[0]?.id || "";
  const subject = subjects.find((item) => item.id === activeId);
  const tasks = data.tasks.filter((task) => task.subjectId === activeId);
  const today = todayKey();
  const groups = new Map<string, PlanTask[]>();
  for (const task of tasks) {
    const list = groups.get(task.dueDate) ?? [];
    list.push(task);
    groups.set(task.dueDate, list);
  }

  async function buildPlan(input: PlanInput) {
    setBusy(true);
    setNote("");
    try {
      const result = await generatePlan({ data: input });
      setNote(result.source === "draft" ? "Drafted from your topics. Add or remove tasks to adjust the plan." : "Plan ready. Add or remove tasks to adjust it.");
      await refresh();
    } catch (error) {
      toast.error(errText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-mute">Plan</p>
        <h1 className="font-display text-3xl leading-none">Exam plan</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col gap-4">
          <PomoPanel subjects={subjects} />
          <Panel className="p-5">
            {subjects.length === 0 ? (
              <p className="text-sm text-mute">Add a subject before building a plan.</p>
            ) : (
              <form
                key={activeId}
                className="flex flex-col gap-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const input: PlanInput = {
                    subjectId: String(form.get("subjectId") ?? activeId),
                    topics: String(form.get("topics") ?? ""),
                    examDate: String(form.get("examDate") ?? ""),
                    today,
                    hoursPerDay: Number(form.get("hours") ?? 2),
                  };
                  if (tasks.some((task) => !task.isCompleted)) {
                    setPendingPlan(input);
                  } else {
                    await buildPlan(input);
                  }
                }}
              >
                <Field label="Subject">
                  <select
                    name="subjectId"
                    className={selectClass}
                    value={activeId}
                    onChange={(event) => setSubjectId(event.target.value)}
                  >
                    {subjects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Exam date">
                  <input name="examDate" type="date" required defaultValue={subject?.targetDate ?? ""} min={today} className={fieldClass} />
                </Field>
                <Field label="Hours a day">
                  <input name="hours" type="number" min={0.5} max={8} step={0.5} defaultValue={2} className={fieldClass} />
                </Field>
                <Field label="Topics, one per line">
                  <textarea name="topics" rows={5} className={`${fieldClass} py-2`} placeholder={"Membrane transport\nCellular respiration\nMitosis"} />
                </Field>
                <Button type="submit" disabled={busy}>
                  {busy ? "Building the plan…" : tasks.length ? "Build a new plan" : "Build plan"}
                </Button>
                {tasks.some((task) => !task.isCompleted) && (
                  <p className="text-xs text-mute">
                    Building a new plan replaces {tasks.filter((task) => !task.isCompleted).length} unfinished tasks. Completed tasks stay.
                  </p>
                )}
                {note && <p className="text-sm text-mute">{note}</p>}
              </form>
            )}
          </Panel>
        </div>

        <Panel className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl">{subject ? subject.title : "Tasks"}</h2>
              <p className="text-sm text-mute">
                {tasks.filter((task) => task.isCompleted).length}/{tasks.length} done
              </p>
            </div>
          </div>

          {subjects.length > 0 && (
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={async (event) => {
                event.preventDefault();
                if (addingTask) return;
                const form = event.currentTarget;
                const data = new FormData(form);
                setAddingTask(true);
                try {
                  await addTask({
                    data: {
                      subjectId: activeId,
                      title: String(data.get("title") ?? ""),
                      dueDate: String(data.get("dueDate") ?? today),
                    },
                  });
                  form.reset();
                  await refresh();
                } catch (error) {
                  toast.error(errText(error));
                } finally {
                  setAddingTask(false);
                }
              }}
            >
              <input name="title" required placeholder="Add a task" className={fieldClass} />
              <input name="dueDate" type="date" required defaultValue={today} className={`${fieldClass} sm:max-w-44`} />
              <Button type="submit" variant="line" disabled={addingTask}>
                {addingTask ? "Adding…" : "Add"}
              </Button>
            </form>
          )}

          {tasks.length === 0 ? (
            <EmptyLine>No tasks for this subject yet.</EmptyLine>
          ) : (
            <div className="mt-4 flex flex-col gap-5">
              {Array.from(groups.entries()).map(([date, items]) => (
                <section key={date}>
                  <h3 className="text-xs tracking-wide text-mute uppercase">{dayLabel(date, today)}</h3>
                  <ul className="mt-2 flex flex-col">
                    {items.map((task) => (
                      <li key={task.id} className="flex items-center gap-3 border-b border-line py-1">
                        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="size-5 accent-brass"
                            disabled={taskActionId !== null}
                            checked={task.isCompleted}
                            onChange={async () => {
                              setTaskActionId(task.id);
                              try {
                                await toggleTask({ data: { id: task.id } });
                                await refresh();
                              } catch (error) {
                                toast.error(errText(error));
                              } finally {
                                setTaskActionId(null);
                              }
                            }}
                          />
                          <span className={task.isCompleted ? "text-mute line-through" : ""}>{task.title}</span>
                        </label>
                        <button
                          type="button"
                          aria-label="Delete task"
                          disabled={taskActionId !== null}
                          className="grid h-11 w-11 place-items-center text-mute hover:text-coral"
                          onClick={async () => {
                            if (!window.confirm(`Delete task "${task.title}"?`)) return;
                            setTaskActionId(task.id);
                            try {
                              await deleteTask({ data: { id: task.id } });
                              await refresh();
                            } catch (error) {
                              toast.error(errText(error));
                            } finally {
                              setTaskActionId(null);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Modal open={Boolean(pendingPlan)} title="Replace unfinished tasks?" onClose={() => setPendingPlan(null)}>
        <p className="text-sm text-mute">
          Building this plan will remove the unfinished tasks for {subject?.title ?? "this subject"}. Completed tasks will stay.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="line" onClick={() => setPendingPlan(null)}>Keep current plan</Button>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!pendingPlan) return;
              const input = pendingPlan;
              setPendingPlan(null);
              await buildPlan(input);
            }}
          >
            Replace unfinished tasks
          </Button>
        </div>
      </Modal>
    </div>
  );
}
