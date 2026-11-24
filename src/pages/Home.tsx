import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useTable } from '../lib/hooks';
import { EmptyState, Pill, Button, Bar } from '../components/ui';
import { IconPlus, IconCheck, IconChevronR, IconAlert, IconMoon } from '../components/icons';
import { isOverdue, daysUntil, compareTasksByPriorityDue, buildNextOccurrence, localDayKey } from '../../shared/logic';
import type { Task, Subject, BacklogItem, Milestone, LearningItem, EnglishPractice, DailyPlan, SleepCheckin } from '../../shared/types';
import { greeting, todayISO } from '../lib/time';

export default function HomePage(props: { toast: (m: string, e?: boolean) => void; subjects: Subject[]; go: (page: string) => void; openQuickAdd: () => void }) {
  const { rows: tasks, refresh: refreshTasks } = useTable<Task>('tasks', 'id DESC');
  const { rows: backlog } = useTable<BacklogItem>('backlog_items', 'id DESC');
  const { rows: milestones } = useTable<Milestone>('milestones', 'position ASC');
  const { rows: learning } = useTable<LearningItem>('learning_items', 'id DESC');
  const { rows: english } = useTable<EnglishPractice>('english_practice', 'practiced_at DESC');
  const { rows: plans, refresh: refreshPlans } = useTable<DailyPlan>('daily_plans', 'id DESC');
  const { rows: sleep, refresh: refreshSleep } = useTable<SleepCheckin>('sleep_checkins', 'id DESC');
  const [shutdown, setShutdown] = useState<string[]>([]);
  const [energy, setEnergy] = useState(3);
  const [bedTime, setBedTime] = useState('22:30');
  const [planNote, setPlanNote] = useState('');
  const planIdRef = useRef<number | null>(null);
  const noteTimer = useRef<unknown>(null);

  const today = todayISO();
  const plan = plans.find((p) => p.date === today);
  const sleepToday = sleep.find((s) => s.date === today);

  useEffect(() => {
    if (plan) { try { setShutdown(JSON.parse(plan.shutdown || '[]')); } catch { setShutdown([]); } }
    else setShutdown([]);
  }, [plan]);
  useEffect(() => { if (sleepToday) setEnergy(sleepToday.energy || 3); }, [sleepToday]);
  useEffect(() => {
    if (plan && planIdRef.current !== plan.id) { planIdRef.current = plan.id; setPlanNote(plan.note || ''); }
    if (!plan && planIdRef.current !== null) { planIdRef.current = null; setPlanNote(''); }
  }, [plan]);
  useEffect(() => { void api().settingGet('bedTime').then((v) => { if (v) setBedTime(v); }); }, []);

  const open = useMemo(() => tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled'), [tasks]);
  const overdue = useMemo(() => open.filter((t) => isOverdue(t.due_at, t.status)), [open]);
  const dueToday = useMemo(() => {
    const key = localDayKey();
    return open.filter((t) => t.due_at?.slice(0, 10) === key || t.scheduled_at?.slice(0, 10) === key);
  }, [open]);
  const nextDeadline = useMemo(() => {
    const withDue = open.filter((t) => t.due_at).sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
    return withDue[0] || null;
  }, [open]);
  const nextMs = useMemo(() => milestones.find((m) => m.status === 'doing') || milestones.find((m) => m.status !== 'done') || null, [milestones]);
  const red = backlog.filter((b) => b.status === 'red').length;
  const yellow = backlog.filter((b) => b.status === 'yellow').length;
  const green = backlog.filter((b) => b.status === 'green').length;
  const cs50 = learning.filter((l) => l.track === 'cs50');
  const cs50Done = cs50.filter((l) => l.status === 'done').length;
  const engWeek = english.filter((e) => Date.now() - new Date(e.practiced_at).getTime() < 7 * 864e5).reduce((s, e) => s + (e.minutes || 0), 0);
  const weakest = useMemo(() => [...props.subjects].filter((s) => !s.archived).sort((a, b) => a.understanding - b.understanding).slice(0, 2), [props.subjects]);
  const hasAny = tasks.length > 0 || backlog.length > 0;

  async function complete(id: number) {
    const t = tasks.find((x) => x.id === id);
    await api().update('tasks', id, { status: 'Completed', completed_at: new Date().toISOString() });
    if (t) {
      const next = buildNextOccurrence({ recurrence: t.recurrence || '', due_at: t.due_at, scheduled_at: t.scheduled_at });
      if (next) {
        await api().create('tasks', {
          title: t.title, description: t.description, category: t.category, subject_id: t.subject_id,
          priority: t.priority, status: 'Planned', due_at: next.due_at, estimated_minutes: t.estimated_minutes,
          actual_minutes: null, scheduled_at: next.scheduled_at, recurrence: t.recurrence, tags: t.tags, notes: t.notes
        });
        props.toast(`Done. Next ${t.recurrence} occurrence scheduled.`);
        await refreshTasks();
        return;
      }
    }
    await refreshTasks();
    props.toast('Done. Nice — pick the next one.');
  }

  async function savePlan(must: number | null, sec: number | null, opt: number | null, note?: string) {
    const payload = { date: today, must_task_id: must, secondary_task_id: sec, optional_task_id: opt, note: note ?? plan?.note ?? '', shutdown: plan?.shutdown || '[]' };
    const existing = plans.find((p) => p.date === today);
    if (existing) await api().update('daily_plans', existing.id, payload);
    else await api().create('daily_plans', payload);
    await refreshPlans();
  }

  async function toggleShutdown(item: string) {
    const next = shutdown.includes(item) ? shutdown.filter((s) => s !== item) : [...shutdown, item];
    setShutdown(next);
    const existing = plans.find((p) => p.date === today);
    const payload = { date: today, must_task_id: plan?.must_task_id ?? null, secondary_task_id: plan?.secondary_task_id ?? null, optional_task_id: plan?.optional_task_id ?? null, note: plan?.note || '', shutdown: JSON.stringify(next) };
    if (existing) await api().update('daily_plans', existing.id, payload);
    else await api().create('daily_plans', payload);
    await refreshPlans();
  }

  async function saveEnergy(v: number) {
    setEnergy(v);
    await saveSleep({ energy: v });
  }

  function sleepHours(bed: string, wake: string): number | null {
    if (!bed || !wake) return null;
    const [bh, bm] = bed.split(':').map(Number);
    const [wh, wm] = wake.split(':').map(Number);
    if ([bh, bm, wh, wm].some((n) => !Number.isFinite(n))) return null;
    let mins = wh * 60 + wm - (bh * 60 + bm);
    if (mins <= 0) mins += 24 * 60; // overnight
    if (mins <= 0 || mins > 24 * 60) return null;
    return Math.round((mins / 60) * 10) / 10;
  }

  async function saveSleep(patch: Partial<{ bedtime: string; wake: string; hours: number | null; energy: number }>) {
    const existing = sleep.find((s) => s.date === today);
    const bed = patch.bedtime ?? existing?.bedtime ?? '';
    const wake = patch.wake ?? existing?.wake ?? '';
    const payload = {
      date: today,
      bedtime: bed,
      wake,
      hours: sleepHours(bed, wake),
      energy: patch.energy ?? existing?.energy ?? energy,
      note: existing?.note || ''
    };
    if (existing) await api().update('sleep_checkins', existing.id, payload);
    else await api().create('sleep_checkins', payload);
    await refreshSleep();
  }

  if (!hasAny) {
    return (
      <div className="stack">
        <div className="hero">
          <h2>{greeting()} — this is your command center</h2>
          <p className="muted" style={{ margin: '6px 0 14px', maxWidth: 560 }}>
            Your 11 subjects are already set up. Add your first tasks and deadlines — Home, Planner and Insights all read from real records. Nothing here is faked.
          </p>
          <div className="row wrap">
            <Button onClick={props.openQuickAdd}><IconPlus size={15} />Add your first task</Button>
            <Button variant="ghost" onClick={() => props.go('school')}>Review subjects</Button>
            <Button variant="ghost" onClick={() => props.go('planner')}>Open planner</Button>
          </div>
        </div>
        <div className="grid cols-3">
          {[['1', 'Capture', 'Quick-add tasks, deadlines and ideas. Triage from Tasks or Inbox.'], ['2', 'Plan the day', 'Pick one must-finish, one secondary, one optional. Protect sleep.'], ['3', 'Do the work', 'Run 45-minute focus blocks, log evidence, review weekly.']].map(([n, t, b]) => (
            <div key={n} className="panel"><p className="eyebrow">Step {n}</p><h4 style={{ margin: '0 0 4px' }}>{t}</h4><p className="small muted" style={{ margin: 0 }}>{b}</p></div>
          ))}
        </div>
      </div>
    );
  }

  const focus = overdue[0] || nextDeadline || [...open].sort(compareTasksByPriorityDue)[0] || null;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-hero)', fontWeight: 750, letterSpacing: '-0.3px' }}>
            {greeting()}
          </h2>
          <div className="muted small">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {open.length} open tasks</div>
        </div>
        <Button onClick={props.openQuickAdd}><IconPlus size={15} />Quick add</Button>
      </div>

      <div className="grid cols-main">
        <div className="stack">
          {focus && (
            <div className="hero">
              <p className="eyebrow" style={{ color: 'var(--accent-strong)' }}>
                {overdue.length > 0 ? `Overdue — ${overdue.length} need attention` : nextDeadline ? 'Up next' : 'Suggested focus'}
              </p>
              <h2>{focus.title}</h2>
              <p className="muted small" style={{ margin: '4px 0 12px' }}>
                {focus.category} · {focus.due_at ? <>due {new Date(focus.due_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ({daysUntil(focus.due_at)}d)</> : 'no due date'}{focus.estimated_minutes ? ` · ~${focus.estimated_minutes} min` : ''}
              </p>
              <div className="row">
                <Button variant="ghost" onClick={() => void complete(focus.id)}><IconCheck size={14} />Mark done</Button>
                <Button variant="ghost" onClick={() => props.go('tasks')}>All tasks<IconChevronR size={14} /></Button>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h3>Today</h3><span className="tail"><span className="link small" onClick={() => props.go('tasks')}>All tasks →</span></span></div>
            {dueToday.length === 0 && overdue.length === 0 ? (
              <p className="small muted" style={{ margin: '4px 0' }}>Nothing dated today. Use the daily plan to pick your three.</p>
            ) : (
              <div className="rows">
                {[...overdue, ...dueToday.filter((t) => !overdue.includes(t))].slice(0, 7).map((t) => (
                  <TaskRow key={t.id} t={t} onDone={() => void complete(t.id)} />
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>School health</h3><span className="tail"><span className="link small" onClick={() => props.go('school')}>Open School →</span></span></div>
            <div className="row wrap" style={{ marginBottom: 10 }}>
              <span className="pill p-red">{red} red</span>
              <span className="pill p-yellow">{yellow} yellow</span>
              <span className="pill p-green">{green} green</span>
              <span className="micro faint">red = learn from scratch · yellow = practice · green = mastered</span>
            </div>
            {weakest.map((s) => (
              <div key={s.id} className="spread small" style={{ padding: '5px 0' }}>
                <span className="grow">{s.name} <span className="faint">· {s.current_topic || s.current_unit || 'no topic set'}</span></span>
                <Dots value={s.understanding} />
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h3>Daily plan</h3></div>
            <PlanPick label="Must-finish" value={plan?.must_task_id ?? null} tasks={open} onChange={(v) => void savePlan(v, plan?.secondary_task_id ?? null, plan?.optional_task_id ?? null)} />
            <PlanPick label="Secondary" value={plan?.secondary_task_id ?? null} tasks={open} onChange={(v) => void savePlan(plan?.must_task_id ?? null, v, plan?.optional_task_id ?? null)} />
            <PlanPick label="Optional" value={plan?.optional_task_id ?? null} tasks={open} onChange={(v) => void savePlan(plan?.must_task_id ?? null, plan?.secondary_task_id ?? null, v)} />
            <input value={planNote} onChange={(e) => {
              const v = e.target.value;
              setPlanNote(v);
              if (noteTimer.current) clearTimeout(noteTimer.current as any);
              noteTimer.current = setTimeout(() => {
                void savePlan(plan?.must_task_id ?? null, plan?.secondary_task_id ?? null, plan?.optional_task_id ?? null, v);
              }, 600);
            }} placeholder="Day note — e.g. travel Friday, keep it light" aria-label="Day note" style={{ marginTop: 2 }} />
            <p className="micro faint" style={{ margin: '8px 0 0' }}>School days hold ~2×45-min blocks + light language. Leave the rest empty.</p>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Projects & learning</h3></div>
            <div className="small" style={{ marginBottom: 8 }}><span className="faint">Capstone · </span><b>{nextMs ? nextMs.title : 'all done'}</b></div>
            <div className="small muted" style={{ marginBottom: 4 }}>CS50 · {cs50Done}/{cs50.length} done</div>
            <Bar pct={cs50.length ? (cs50Done / cs50.length) * 100 : 0} />
            <div className="small muted" style={{ margin: '8px 0 10px' }}>English this week · <b className="num">{engWeek} min</b></div>
            <div className="row">
              <Button size="sm" variant="subtle" onClick={() => props.go('capstone')}>Capstone</Button>
              <Button size="sm" variant="subtle" onClick={() => props.go('learning')}>Learning</Button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3><span className="row" style={{ gap: 7 }}><IconMoon size={14} />Sleep & energy</span></h3>{sleepToday?.hours ? <span className="tail pill p-done num">{sleepToday.hours}h</span> : null}</div>
            <div className="row" style={{ marginBottom: 10 }}>
              <label className="field" style={{ flex: 1 }}>Bed
                <input type="time" value={sleepToday?.bedtime || ''} onChange={(e) => void saveSleep({ bedtime: e.target.value })} />
              </label>
              <label className="field" style={{ flex: 1 }}>Wake
                <input type="time" value={sleepToday?.wake || ''} onChange={(e) => void saveSleep({ wake: e.target.value })} />
              </label>
            </div>
            <div className="row" style={{ marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} onClick={() => void saveEnergy(v)} title={`Energy ${v}`}
                  style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--line)', cursor: 'pointer', fontWeight: 700, fontSize: 12.5, background: energy === v ? 'var(--accent)' : 'transparent', color: energy === v ? '#fff' : 'var(--text2)' }}>
                  {v}
                </button>
              ))}
              <span className="micro faint">energy</span>
            </div>
            <p className="micro faint" style={{ margin: 0 }}>Target bed {bedTime} · boarding weeks need 8h+. Sleep beats extra tasks.</p>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Shutdown</h3><span className="tail micro faint num">{shutdown.length}/4</span></div>
            {['Planner reviewed', 'Bag + uniform ready', 'Desk cleared', 'Phone away for sleep'].map((it) => (
              <label key={it} className="trow" style={{ cursor: 'pointer' }}>
                <button className={`check square-check ${shutdown.includes(it) ? 'on' : ''}`} onClick={() => void toggleShutdown(it)} aria-label={it}>
                  {shutdown.includes(it) && <IconCheck size={12} />}
                </button>
                <span className="small">{it}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Dots(props: { value: number }) {
  return (
    <span className="urating" title={`${props.value}/5`}>
      {Array.from({ length: 5 }, (_, i) => <i key={i} className={i < props.value ? 'f' : ''} />)}
    </span>
  );
}

function PlanPick(props: { label: string; value: number | null; tasks: Task[]; onChange: (v: number | null) => void }) {
  return (
    <label className="field" style={{ marginBottom: 10 }}>{props.label}
      <select value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">— choose —</option>
        {props.tasks.map((t) => <option key={t.id} value={t.id}>{t.priority} · {t.title}</option>)}
      </select>
    </label>
  );
}

function TaskRow(props: { t: Task; onDone: () => void }) {
  const { t } = props;
  const late = isOverdue(t.due_at, t.status);
  return (
    <div className={`trow ${t.status === 'Completed' ? 'done' : ''}`}>
      <button className="check" onClick={props.onDone} aria-label={`Complete ${t.title}`}><IconCheck size={11} /></button>
      <div className="grow">
        <div className="t">{t.title}</div>
        <div className="m">{t.category}{t.estimated_minutes ? ` · ${t.estimated_minutes}m` : ''}{late ? ' · overdue' : ''}</div>
      </div>
      {late && <span style={{ color: 'var(--bad)', display: 'inline-flex' }}><IconAlert size={14} /></span>}
      <Pill text={t.priority} />
    </div>
  );
}
