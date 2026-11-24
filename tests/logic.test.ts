import { describe, it, expect } from 'vitest';
import {
  validateTaskTitle, validateDuration, isOverdue, daysUntil,
  advanceRecurrence, canTransitionBacklog, materialTotal, budgetTotal,
  completionRate, sessionAdherence, detectOverload, compareTasksByPriorityDue,
  isSchoolDay, defaultAvailableStudyMinutes, localDayKey, buildNextOccurrence, toCsvCell
} from '../shared/logic';

describe('tasks', () => {
  it('requires a title', () => {
    expect(validateTaskTitle('')).toBeTruthy();
    expect(validateTaskTitle('  ')).toBeTruthy();
    expect(validateTaskTitle('Friction problems')).toBeNull();
  });
  it('validates durations', () => {
    expect(validateDuration(-5)).toBeTruthy();
    expect(validateDuration(2000)).toBeTruthy();
    expect(validateDuration(45)).toBeNull();
    expect(validateDuration(null)).toBeNull();
  });
  it('detects overdue only when open', () => {
    const past = new Date(Date.now() - 864e5).toISOString();
    expect(isOverdue(past, 'Planned')).toBe(true);
    expect(isOverdue(past, 'Completed')).toBe(false);
    expect(isOverdue(null, 'Planned')).toBe(false);
  });
  it('computes days until', () => {
    const future = new Date(Date.now() + 2 * 864e5).toISOString();
    expect(daysUntil(future)).toBe(2);
  });
  it('advances recurrence', () => {
    const base = new Date('2026-10-05T10:00:00Z').toISOString();
    expect(advanceRecurrence('daily', base)).toContain('2026-10-06');
    expect(advanceRecurrence('weekly', base)).toContain('2026-10-12');
    expect(advanceRecurrence('', base)).toBeNull();
  });
  it('sorts by priority then due', () => {
    const a = { priority: 'P2', due_at: new Date('2026-10-20').toISOString() };
    const b = { priority: 'P1', due_at: new Date('2026-12-01').toISOString() };
    expect(compareTasksByPriorityDue(a, b)).toBeGreaterThan(0);
  });
});

describe('backlog', () => {
  it('blocks red->green jumps', () => {
    expect(canTransitionBacklog('red', 'yellow')).toBe(true);
    expect(canTransitionBacklog('red', 'green')).toBe(false);
    expect(canTransitionBacklog('yellow', 'green')).toBe(true);
    expect(canTransitionBacklog('green', 'yellow')).toBe(true);
  });
});

describe('budget + metrics', () => {
  it('totals materials in EGP', () => {
    expect(materialTotal(3, 12.5)).toBe(37.5);
    expect(budgetTotal([{ quantity: 2, unit_price_egp: 10 }, { quantity: 1, unit_price_egp: 5 }])).toBe(25);
  });
  it('completion + adherence', () => {
    expect(completionRate(3, 4)).toBe(75);
    expect(completionRate(0, 0)).toBeNull();
    expect(sessionAdherence(45, 40)).toBe(89);
  });
  it('detects overload and suggests moving optional work', () => {
    const r = detectOverload({ schoolMinutes: 480, sleepMinutes: 480, restMinutes: 90, plannedWorkMinutes: 300, availableAfterSchoolMinutes: 110 });
    expect(r.overloaded).toBe(true);
    expect(r.suggestion).toMatch(/optional/i);
  });
  it('knows school days Sun-Thu', () => {
    expect(isSchoolDay(new Date('2026-10-11T12:00:00'))).toBe(true); // Sunday
    expect(isSchoolDay(new Date('2026-10-16T12:00:00'))).toBe(false); // Friday
    expect(defaultAvailableStudyMinutes(true)).toBe(110);
  });
  it('keys days in local time, not UTC', () => {
    // 00:30 local must stay "today" even though UTC is still yesterday.
    const d = new Date(2026, 9, 10, 0, 30, 0);
    expect(localDayKey(d)).toBe('2026-10-10');
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('builds the next occurrence for recurring tasks', () => {
    const next = buildNextOccurrence({ recurrence: 'daily', due_at: '2026-10-10T10:00:00.000Z', scheduled_at: null });
    expect(next?.due_at).toContain('2026-10-11');
    expect(next?.scheduled_at).toBeNull();
    expect(buildNextOccurrence({ recurrence: '', due_at: '2026-10-10T10:00:00.000Z', scheduled_at: null })).toBeNull();
    expect(buildNextOccurrence({ recurrence: 'weekly', due_at: null, scheduled_at: null })).toBeNull();
  });
  it('neutralizes CSV formula injection', () => {
    expect(toCsvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(toCsvCell('+cmd')).toBe(`"'+cmd"`);
    expect(toCsvCell('plain title')).toBe('"plain title"');
    expect(toCsvCell('a"b')).toBe('"a""b"');
    expect(toCsvCell(null)).toBe('""');
  });
});
