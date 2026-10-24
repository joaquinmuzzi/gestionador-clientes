"use client";

import Link from "next/link";
import { useState } from "react";
import type { AgendaTask } from "@/lib/dashboard/queries";
import { formatDay, isOverdue } from "@/lib/devices/records";
import { addDays, weekDays } from "@/lib/dashboard/week";
import { useToday } from "../customers/[id]/device-records";

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// The pending tasks of a week, Monday to Sunday, and the overdue ones above
// it. Laid out here, in the browser, because "today" is the technician's.
export function WeekAgenda({ tasks }: { tasks: AgendaTask[] }) {
  const today = useToday();
  const [offset, setOffset] = useState(0);

  if (!today) {
    return (
      <section className="rounded-sm border border-neutral-300 bg-white px-3.5 py-3">
        <p className="text-sm text-neutral-600">Cargando la semana…</p>
      </section>
    );
  }

  const days = weekDays(addDays(today, offset * 7));
  const overdue = tasks.filter((task) => isOverdue(task.dueAt, today));

  return (
    <section
      aria-labelledby="agenda-week"
      className="rounded-sm border border-neutral-300 bg-white px-3.5 py-3"
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h2 id="agenda-week" className="font-semibold">
          Semana del {formatDay(days[0]).slice(0, 5)} al {formatDay(days[6]).slice(0, 5)}
        </h2>
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label="Semana anterior"
            onClick={() => setOffset(offset - 1)}
            className="size-9 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-[13px] hover:bg-neutral-100"
          >
            Hoy
          </button>
          <button
            type="button"
            aria-label="Semana siguiente"
            onClick={() => setOffset(offset + 1)}
            className="size-9 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100"
          >
            ›
          </button>
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="mb-3.5 rounded-lg border border-warn-line bg-warn-soft/50 px-3 py-2.5">
          <h3 className="text-sm font-semibold text-warn-ink">
            {overdue.length === 1 ? "1 tarea vencida" : `${overdue.length} tareas vencidas`}
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {overdue.map((task) => (
              <li key={task.id}>
                <TaskCard task={task} day />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <ol className="grid min-w-[60rem] grid-cols-7 gap-2.5">
          {days.map((day, index) => {
            const dayTasks = tasks.filter((task) => task.dueAt === day);
            const isToday = day === today;
            return (
              <li
                key={day}
                aria-label={`${DAY_NAMES[index]} ${formatDay(day)}`}
                aria-current={isToday ? "date" : undefined}
                className={
                  "flex min-h-36 flex-col gap-2 rounded-lg border p-2.5 " +
                  (isToday ? "border-accent-line bg-accent-soft/50" : "border-neutral-100 bg-neutral-50/60")
                }
              >
                <div className="flex justify-between text-[13px]">
                  <span className="text-neutral-600">{DAY_NAMES[index]}</span>
                  <span className="font-semibold">{Number(day.slice(8))}</span>
                </div>
                {dayTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function TaskCard({ task, day = false }: { task: AgendaTask; day?: boolean }) {
  return (
    <Link
      href={`/customers/${task.device.customer.id}?device=${task.device.id}`}
      className="block rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[13px] leading-snug hover:border-accent-line"
    >
      <span className="block font-medium break-words">{task.title}</span>
      <span className="block text-xs text-neutral-600">
        {day && `${formatDay(task.dueAt)} · `}
        {task.device.customer.name} · {task.device.name}
      </span>
    </Link>
  );
}
