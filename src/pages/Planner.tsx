import React, { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useTable } from '../lib/hooks';
import { Modal, EmptyState, Button, IconBtn, Seg, Field } from '../components/ui';
import { IconChevronL, IconChevronR, IconPlus, IconPlanner as IconPlannerGlyph } from '../components/icons';
import { detectOverload, defaultAvailableStudyMinutes, isSchoolDay } from '../../shared/logic';
import type { Task, StudySession } from '../../shared/types';

type View = 'day' | 'week' | 'agenda';

export default function PlannerPage(props: { toast: (m: string, e?: boolean) => void }) {
  const { rows: tasks, refresh } = useTable<Task>('tasks', 'scheduled_at ASC');
  const { rows: sessions } = useTable<StudySession>('study_sessions', 'id DESC');
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [schoolStart, setSchoolStart] = useState('07:00');
  const [schoolEnd, setSchoolEnd] = useState('15:00');
  const [sched, setSched] = useState<{ day: Date; hour: number; title: string; mins: number } | null>(null);

  const days: Date[] = useMemo(() => {
    if (view === 'day') return [anchor];
    const start = new Date(anchor);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [anchor, view]);

  const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function tasksOn(day: Date): Task[] {
    const key = keyOf(day);
    return tasks.filter((t) => {
      if (t.status === 'Completed' || t.status === 'Cancelled') return false;
      return t.scheduled_at?.slice(0, 10) === key || t.due_at?.slice(0, 10) === key;
    });
  }

  function openQuickAdd(day: Date, hour: number) {
    setSched({ day, hour, title: '', mins: 45 });
  }

  async function saveQuickAdd() {
    if (!sched || !sched.title.trim()) return;
    const dt = new Date(sched.day); dt.setHours(sched.hour, 0, 0, 0);
    const mins = Math.min(180, Math.max(15, Math.round(sched.mins) || 45));
    await api().create('tasks', { title: sched.title.trim(), category: 'School', priority: 'P2', status: 'Planned', scheduled_at: dt.toISOString(), estimated_minutes: mins });
    setSched(null);
    await refresh();
    props.toast('Scheduled.');
  }

  function quickAdd(day: Date, hour: number) {
    openQuickAdd(day, hour);
  }

  async function moveTask(t: Task, dir: 1 | -1) {
    const base = t.scheduled_at || t.due_at || new Date().toISOString();
    const d = new Date(base);
    d.setDate(d.getDate() + dir);
    await api().update('tasks', t.id, { scheduled_at: d.toISOString() });
    await refresh();
  }

  const anchorTasks = tasksOn(anchor);
  const anchorWork = anchorTasks.reduce((s, t) => s + (t.estimated_minutes || 45), 0);
  const avail = defaultAvailableStudyMinutes(isSchoolDay(anchor));
  const overload = detectOverload({ schoolMinutes: 480, sleepMinutes: 480, restMinutes: 90, plannedWorkMinutes: anchorWork, availableAfterSchoolMinutes: avail });
  const weekWork = days.reduce((s, d) => s + tasksOn(d).reduce((x, t) => x + (t.estimated_minutes || 45), 0), 0);
  const unscheduled = tasks.filter((t) => !t.scheduled_at && !t.due_at && t.status !== 'Completed' && t.status !== 'Cancelled');

  const step = view === 'day' ? 1 : 7;
  const HOURS = [15, 16, 17, 18, 19, 20, 21];
  const todayKey = keyOf(new Date());

  return (
    <div className="stack">
      <div className="spread">
        <Seg<View> value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'agenda', label: 'Agenda' }]} />
        <div className="row">
          <IconBtn label="Previous" bordered onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - step); setAnchor(d); }}><IconChevronL size={15} /></IconBtn>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <IconBtn label="Next" bordered onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + step); setAnchor(d); }}><IconChevronR size={15} /></IconBtn>
          <span className="small muted num" style={{ minWidth: 120 }}>{anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        </div>
        <span style={{ flex: 1 }} />
        <label className="micro faint row">School <input type="time" value={schoolStart} onChange={(e) => setSchoolStart(e.target.value)} style={{ width: 118 }} /></label>
        <label className="micro faint row">to <input type="time" value={schoolEnd} onChange={(e) => setSchoolEnd(e.target.value)} style={{ width: 118 }} /></label>
      </div>

      {overload.overloaded ? (
        <div className="strip bad small">
          <b>Overloaded day.</b> {overload.suggestion} Planned {anchorWork} min vs realistic ~{avail} min after school. Confirmed deadlines stay — move optional work first.
        </div>
      ) : (
        <div className="strip small muted">
          School block {schoolStart}–{schoolEnd} (Sun–Thu, lunch not free) · food + rest after school · 45-min focus · break · optional 2nd block · light language · prep + sleep. No morning study. <b>{weekWork} min</b> planned this view.
        </div>
      )}

      {view === 'agenda' ? (
        <div className="grid cols-2">
          {days.map((d) => {
            const items = tasksOn(d);
            const school = isSchoolDay(d);
            return (
              <div key={keyOf(d)} className="panel">
                <div className="panel-head">
                  <h3>{d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
                  <span className="tail"><span className={`pill ${school ? 'p-muted' : 'p-done'}`}>{school ? 'school' : 'home'}</span></span>
                </div>
                {items.length === 0 ? <p className="small faint" style={{ margin: '2px 0 8px' }}>Open — protect it, or rest.</p> : (
                  <div className="rows">
                    {items.map((t) => (
                      <div key={t.id} className="trow">
                        <span className={`dot d-${t.priority}`} />
                        <div className="grow"><div className="t">{t.title}</div><div className="m">{t.estimated_minutes || 45}m · {t.priority}</div></div>
                        <span className="acts">
                          <IconBtn label="Move a day earlier" onClick={() => void moveTask(t, -1)}><IconChevronL size={13} /></IconBtn>
                          <IconBtn label="Move a day later" onClick={() => void moveTask(t, 1)}><IconChevronR size={13} /></IconBtn>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Button size="sm" variant="subtle" onClick={() => void quickAdd(d, 16)}><IconPlus size={13} />4 PM slot</Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel" style={{ padding: 6, overflowX: 'auto' }}>
          <table className="plan-grid">
            <thead><tr><th style={{ minWidth: 64 }}>Time</th>{days.map((d) => (
              <th key={keyOf(d)} className={keyOf(d) === todayKey ? 'today' : ''}>
                {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                <br /><span style={{ fontWeight: 500, textTransform: 'none' }}>{isSchoolDay(d) ? `${schoolStart}–${schoolEnd}` : 'home'}</span>
              </th>))}</tr></thead>
            <tbody>
              <tr>
                <td className="micro faint num">{schoolStart}–{schoolEnd}</td>
                {days.map((d) => <td key={keyOf(d)} className={keyOf(d) === todayKey ? 'today' : ''}><span className={`pill ${isSchoolDay(d) ? 'p-muted' : 'p-done'}`}>{isSchoolDay(d) ? 'school block' : 'family · rest'}</span></td>)}
              </tr>
              {HOURS.map((h) => (
                <tr key={h}>
                  <td className="micro faint num">{h}:00</td>
                  {days.map((d) => {
                    const items = tasksOn(d).filter((t) => (t.scheduled_at ? new Date(t.scheduled_at).getHours() : 16) === h);
                    const sess = sessions.filter((s) => s.started_at?.slice(0, 10) === keyOf(d));
                    return (
                      <td key={keyOf(d)} className={`slot ${keyOf(d) === todayKey ? 'today' : ''}`} onDoubleClick={() => void quickAdd(d, h)} title="Double-click to schedule here">
                        {h === 15 && <div className="micro faint">food + rest</div>}
                        {items.map((t) => <div key={t.id} className={`chip ${t.priority === 'P1' ? 'p1' : t.priority === 'P2' ? 'p2' : ''}`}><b>{t.title}</b><span>{t.estimated_minutes || 45}m · {t.priority}</span></div>)}
                        {h === 16 && sess.slice(0, 1).map((s) => <div key={s.id} className="micro faint">◷ {s.topic || s.objective} ({s.actual_minutes ?? s.planned_minutes}m)</div>)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Unscheduled · {unscheduled.length}</h3></div>
          <p className="small muted" style={{ margin: '0 0 8px' }}>{unscheduled.slice(0, 5).map((t) => t.title).join(' · ')} — assign a slot instead of piling onto midnight.</p>
        </div>
      )}
      {tasks.length === 0 && (
        <div className="panel"><EmptyState icon={<IconPlannerGlyph />} title="Planner is empty" body="Schedule tasks into after-school slots. Overload warns instead of auto-pushing to midnight." /></div>
      )}

      {sched && (
        <Modal title="Schedule task" sub={`${sched.day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`} onClose={() => setSched(null)}
          footer={<><Button variant="ghost" onClick={() => setSched(null)}>Cancel</Button><Button onClick={() => void saveQuickAdd()}>Schedule</Button></>}>
          <div className="form-grid">
            <Field label="Title" full><input value={sched.title} onChange={(e) => setSched({ ...sched, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void saveQuickAdd(); }} autoFocus placeholder="What goes in this slot?" /></Field>
            <Field label="Hour"><select value={sched.hour} onChange={(e) => setSched({ ...sched, hour: Number(e.target.value) })}>{HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></Field>
            <Field label="Est. minutes"><input type="number" min={15} max={180} value={sched.mins} onChange={(e) => setSched({ ...sched, mins: Number(e.target.value) })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
