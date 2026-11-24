// Pure validation + business logic. No Node/Electron imports — unit-testable in vitest.

export function validateTaskTitle(title: string): string | null {
  if (!title || !title.trim()) return 'Title is required.';
  if (title.trim().length > 200) return 'Title must be 200 characters or fewer.';
  return null;
}

export function validateDuration(minutes: number | null | undefined, field = 'Duration'): string | null {
  if (minutes === null || minutes === undefined || minutes === ('' as unknown as number)) return null;
  if (!Number.isFinite(minutes)) return `${field} must be a number.`;
  if (minutes < 0) return `${field} cannot be negative.`;
  if (minutes > 24 * 60) return `${field} is unrealistically large (max 1440 min).`;
  return null;
}

export function validateDueVsScheduled(dueAt: string | null, scheduledAt: string | null): string | null {
  if (!dueAt || !scheduledAt) return null;
  const d = new Date(dueAt).getTime();
  const s = new Date(scheduledAt).getTime();
  if (Number.isNaN(d) || Number.isNaN(s)) return 'Dates must be valid.';
  return null; // scheduled may be before/after due; planner warns but does not block
}

export function isOverdue(dueAt: string | null, status: string, now = new Date()): boolean {
  if (!dueAt || status === 'Completed' || status === 'Cancelled') return false;
  return new Date(dueAt).getTime() < now.getTime();
}

export function daysUntil(dueAt: string | null, now = new Date()): number | null {
  if (!dueAt) return null;
  const ms = new Date(dueAt).getTime() - now.getTime();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function nextWeeklyOccurrence(fromIso: string): string {
  const d = new Date(fromIso);
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

export function nextDailyOccurrence(fromIso: string): string {
  const d = new Date(fromIso);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export function advanceRecurrence(recurrence: string, fromIso: string): string | null {
  if (recurrence === 'daily') return nextDailyOccurrence(fromIso);
  if (recurrence === 'weekly') return nextWeeklyOccurrence(fromIso);
  return null;
}

export const BACKLOG_ORDER = ['red', 'yellow', 'green'] as const;

export function canTransitionBacklog(from: string, to: string): boolean {
  // Allowed: red->yellow, yellow->green, yellow->red (regression), green->yellow (regression).
  // Red->green directly is blocked: must show practice evidence (must go via yellow).
  if (from === to) return true;
  if (from === 'red' && to === 'yellow') return true;
  if (from === 'yellow' && to === 'green') return true;
  if (from === 'yellow' && to === 'red') return true;
  if (from === 'green' && to === 'yellow') return true;
  return false;
}

export function materialTotal(qty: number, unitPrice: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return 0;
  return Math.round(qty * unitPrice * 100) / 100;
}

export function budgetTotal(items: Array<{ quantity: number; unit_price_egp: number }>): number {
  return items.reduce((s, it) => s + materialTotal(it.quantity, it.unit_price_egp), 0);
}

export interface MetricTasks {
  planned: number;
  completed: number;
}

export function completionRate(completed: number, planned: number): number | null {
  if (planned <= 0) return null;
  return Math.round((completed / planned) * 100);
}

export function sessionAdherence(plannedMinutes: number, actualMinutes: number | null): number | null {
  if (!plannedMinutes || plannedMinutes <= 0 || actualMinutes === null) return null;
  return Math.round((actualMinutes / plannedMinutes) * 100);
}

/** Planner: detect overload. Day has fixed school block + flexible sessions. */
export function detectOverload(args: {
  schoolMinutes: number;
  sleepMinutes: number;
  restMinutes: number;
  plannedWorkMinutes: number;
  availableAfterSchoolMinutes: number;
}): { overloaded: boolean; overflowMinutes: number; suggestion: string } {
  const { plannedWorkMinutes, availableAfterSchoolMinutes } = args;
  const overflow = plannedWorkMinutes - availableAfterSchoolMinutes;
  if (overflow <= 0) return { overloaded: false, overflowMinutes: 0, suggestion: 'Schedule fits realistically.' };
  return {
    overloaded: true,
    overflowMinutes: overflow,
    suggestion: `Over by ${overflow} min. Move or drop an optional task; protect deadlines first.`
  };
}

/** Priority sort: P1 first, then earliest due. */
export function compareTasksByPriorityDue(
  a: { priority: string; due_at: string | null },
  b: { priority: string; due_at: string | null }
): number {
  const rank = (p: string) => (p === 'P1' ? 0 : p === 'P2' ? 1 : 2);
  const r = rank(a.priority) - rank(b.priority);
  if (r !== 0) return r;
  if (!a.due_at && !b.due_at) return 0;
  if (!a.due_at) return 1;
  if (!b.due_at) return -1;
  return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
}

export function isSchoolDay(date: Date): boolean {  // School days Sunday(0) - Thursday(4). Friday(5), Saturday(6) are home/rest.
  const d = date.getDay();
  return d === 0 || d === 1 || d === 2 || d === 3 || d === 4;
}

export function defaultAvailableStudyMinutes(isSchool: boolean): number {
  // Realistic: school days ~ 2x45min blocks + 20min language = ~110 min max.
  // Fri/Sat: more flexible, cap at 180 min to protect rest.
  return isSchool ? 110 : 180;
}

/**
 * Local calendar-day key (YYYY-MM-DD). toISOString() is UTC and shows the
 * wrong day near midnight in UTC+2/3 — Today views must use this.
 */
export function localDayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Next occurrence for a recurring task: advances each dated field. */
export function buildNextOccurrence(t: {
  recurrence: string;
  due_at: string | null;
  scheduled_at: string | null;
}): { due_at: string | null; scheduled_at: string | null } | null {
  if (t.recurrence !== 'daily' && t.recurrence !== 'weekly') return null;
  if (!t.due_at && !t.scheduled_at) return null;
  const adv = (iso: string | null) => (iso ? advanceRecurrence(t.recurrence, iso) : null);
  return { due_at: adv(t.due_at), scheduled_at: adv(t.scheduled_at) };
}

/**
 * CSV cell guard against formula injection: values starting with
 * = + - @ (or after whitespace) execute on spreadsheet open.
 */
export function toCsvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  const escaped = s.replace(/"/g, '""');
  // A leading space/tab or = + - @ turns the cell into a live formula.
  const guarded = /^[\s=+\-@]/.test(s) ? `'${escaped}` : escaped;
  return `"${guarded}"`;
}
