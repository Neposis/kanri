import type { Card } from "~/types/kanban-types";

export const countFinishedTasks = (tasks: Card["tasks"] | undefined): number =>
  tasks ? tasks.filter((t) => t.finished).length : 0;

export const taskPercentage = (tasks: Card["tasks"] | undefined): number => {
  if (!tasks || tasks.length === 0) return 0;
  return Math.round((countFinishedTasks(tasks) / tasks.length) * 100);
};

export const priorityClasses: Record<number, string> = {
  1: "bg-red-500/25 text-red-400",
  2: "bg-orange-500/25 text-orange-400",
  3: "bg-yellow-500/25 text-yellow-400",
  4: "bg-sky-500/25 text-sky-400",
};
