import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useTable, toLocalInput, fromLocalInput } from '../lib/hooks';
import { Modal, EmptyState, Pill, Confirm, Button, IconBtn, Field, Seg } from '../components/ui';
import { IconPlus, IconCheck, IconEdit, IconCopy, IconTrash, IconAlert } from '../components/icons';
import { validateTaskTitle, validateDuration, compareTasksByPriorityDue, isOverdue, buildNextOccurrence, localDayKey } from '../../shared/logic';
import type { Task, Subject } from '../../shared/types';
import { fmtDateTime } from '../lib/time';

const CATS = ['School', 'Homework', 'Backlog recovery', 'Assessment preparation', 'Capstone', 'CS50', 'English', 'Competitions', 'Personal', 'Other'];
const STATUSES = ['Inbox', 'Planned', 'In progress', 'Waiting', 'Completed', 'Cancelled'];
type View = 'Today' | 'Upcoming' | 'Overdue' | 'All' | 'Completed';

export default function TasksPage(props: { toast: (m: string, e?: boolean) => void; subjects: Subject[] }) {
  const { rows: tasks, refresh } = useTable<Task>('tasks', 'id DESC');
  const [view, setView] = useState<View>('Today');
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('All');
  const [editing, setEditing] = useState<(Partial<Task> & { id?: number }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<'priority' | 'due'>('priority');

  const counts = useMemo(() => {
    const now = new Date();
    const open = tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled');
    return {
      Overdue: open.filter((t) => isOverdue(t.due_at, t.status, now)).length,
      All: open.length,
      Completed: tasks.filter((t) => t.status === 'Completed').length
    };
  }, [tasks]);

  const filtered = useMemo(() => {
    const now = new Date();
    const sod = new Date(now); sod.setHours(0, 0, 0, 0);
    const eod = new Date(now); eod.setHours(23, 59, 59, 999);
    const todayKey = localDayKey(sod);
    let list = [...tasks];
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((t) => `${t.title} ${t.description || ''} ${t.notes || ''}`.toLowerCase().includes(s));
    }
    if (catF !== 'All') list = list.filter((t) => t.category === catF);
    const dt = (t: Task) => (t.due_at ? new Date(t.due_at).getTime() : NaN);
    if (view === 'Today') list = list.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled' && ((t.due_at && dt(t) >= sod.getTime() && dt(t) <= eod.getTime()) || t.scheduled_at?.slice(0, 10) === todayKey || (!t.due_at && !t.scheduled_at)));
    else if (view === 'Upcoming') list = list.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled' && t.due_at && dt(t) > eod.getTime());
    else if (view === 'Overdue') list = list.filter((t) => isOverdue(t.due_at, t.status, now));
    else if (view === 'Completed') list = list.filter((t) => t.status === 'Completed');
    else list = list.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled');
    list.sort(sortMode === 'priority' ? compareTasksByPriorityDue : (a, b) => {
      if (!a.due_at && !b.due_at) return 0;
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });
    return list;
  }, [tasks, view, q, catF, sortMode]);

  async function save() {
    if (!editing) return;
    const tErr = validateTaskTitle(editing.title || '');
    const dErr = validateDuration(editing.estimated_minutes ?? null, 'Estimated');
    if (tErr || dErr) { setErr(tErr || dErr); return; }
    const payload: Record<string, unknown> = {
      title: editing.title!.trim(),
      description: editing.description || '',
      category: editing.category || 'School',
      subject_id: editing.subject_id || null,
      priority: editing.priority || 'P2',
      status: editing.status || 'Inbox',
      due_at: editing.due_at || null,
      estimated_minutes: editing.estimated_minutes ?? null,
      actual_minutes: editing.actual_minutes ?? null,
      scheduled_at: editing.scheduled_at || null,
      recurrence: editing.recurrence || '',
      tags: editing.tags || '[]',
      notes: editing.notes || ''
    };
    if (payload.status === 'Completed' && !editing.completed_at) (payload as any).completed_at = new Date().toISOString();
    if (payload.status !== 'Completed') (payload as any).completed_at = null;
    try {
      if (editing.id) await api().update('tasks', editing.id, payload);
      else await api().create('tasks', payload);
      setEditing(null); setErr(null);
      await refresh();
      props.toast('Task saved.');
    } catch (e: any) { setErr(e?.message || 'Save failed.'); }
  }

  async function complete(id: number, done: boolean) {
    const t = tasks.find((x) => x.id === id);
    await api().update('tasks', id, { status: done ? 'Completed' : 'Planned', completed_at: done ? new Date().toISOString() : null });
    // Recurring tasks spawn their next occurrence instead of just ending.
    if (done && t) {
      const next = buildNextOccurrence({ recurrence: t.recurrence || '', due_at: t.due_at, scheduled_at: t.scheduled_at });
      if (next) {
        await api().create('tasks', {
          title: t.title, description: t.description, category: t.category, subject_id: t.subject_id,
          priority: t.priority, status: 'Planned', due_at: next.due_at, estimated_minutes: t.estimated_minutes,
          actual_minutes: null, scheduled_at: next.scheduled_at, recurrence: t.recurrence, tags: t.tags, notes: t.notes
        });
        props.toast(`Done. Next ${t.recurrence} occurrence scheduled.`);
        await refresh();
        return;
      }
    }
    await refresh();
  }

  async function duplicate(id: number) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const { id: _a, created_at: _b, completed_at: _c, ...rest } = t as any;
    void _a; void _b; void _c;
    await api().create('tasks', { ...rest, title: `${t.title} (copy)`, status: 'Inbox', completed_at: null });
    await refresh();
    props.toast('Task duplicated.');
  }

  const subjName = (id: number | null) => props.subjects.find((s) => s.id === id)?.name || null;

  return (
    <div className="stack">
      <div className="spread">
        <Seg<View>
          value={view}
          onChange={setView}
          options={(['Today', 'Upcoming', 'Overdue', 'All', 'Completed'] as View[]).map((v) => ({
            value: v,
            label: v === 'Overdue' ? `Overdue · ${counts.Overdue}` : v === 'All' ? `All · ${counts.All}` : v === 'Completed' ? `Done · ${counts.Completed}` : v
          }))}
        />
        <span style={{ flex: 1 }} />
        <div className="search-input" style={{ maxWidth: 220 }}>
          <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tasks" style={{ paddingLeft: 10, paddingRight: 10 }} />
        </div>
        <select value={catF} onChange={(e) => setCatF(e.target.value)} aria-label="Category" style={{ maxWidth: 170 }}>
          <option>All</option>{CATS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as any)} aria-label="Sort" style={{ maxWidth: 150 }}>
          <option value="priority">Priority first</option><option value="due">Due date</option>
        </select>
        <Button onClick={() => { setErr(null); setEditing({ title: '', category: 'School', priority: 'P2', status: 'Inbox' }); }}><IconPlus size={15} />New task</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<IconCheck size={20} />} title={view === 'Overdue' ? 'Nothing overdue' : `No tasks in ${view}`} body={view === 'Today' ? 'A calm day. Add one must-finish task, or pull from the backlog.' : 'Create a task to get started.'} actionLabel="+ New task" onAction={() => setEditing({ title: '', category: 'School', priority: 'P2', status: 'Inbox' })} />
        </div>
      ) : (
        <div className="panel flush">
          <div className="rows">
            {filtered.map((t) => {
              const late = isOverdue(t.due_at, t.status);
              const sn = subjName(t.subject_id);
              return (
                <div key={t.id} className={`trow ${t.status === 'Completed' ? 'done' : ''}`}>
                  <button className={`check ${t.status === 'Completed' ? 'on' : ''}`} onClick={() => void complete(t.id, t.status !== 'Completed')} aria-label={`Toggle ${t.title}`}>
                    {t.status === 'Completed' && <IconCheck size={11} />}
                  </button>
                  <div className="grow">
                    <div className="t">{t.title}</div>
                    <div className="m">
                      {t.category}{sn ? ` · ${sn}` : ''}{t.due_at ? ` · due ${fmtDateTime(t.due_at)}` : ''}{t.estimated_minutes ? ` · ${t.estimated_minutes}m` : ''}
                    </div>
                  </div>
                  {late && <span style={{ color: 'var(--bad)', display: 'inline-flex' }} title="Overdue"><IconAlert size={15} /></span>}
                  <Pill text={t.priority} />
                  <Pill text={t.status} />
                  <span className="acts">
                    <IconBtn label="Edit" onClick={() => { setErr(null); setEditing({ ...t }); }}><IconEdit size={14} /></IconBtn>
                    <IconBtn label="Duplicate" onClick={() => void duplicate(t.id)}><IconCopy size={14} /></IconBtn>
                    <IconBtn label="Delete" danger onClick={() => setConfirmDel(t.id)}><IconTrash size={14} /></IconBtn>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit task' : 'New task'} sub="Keep it concrete — one task, one outcome" onClose={() => setEditing(null)}
          footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={() => void save()}>Save task</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Title" full><input value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} autoFocus placeholder="e.g. Solve 5 friction problems" /></Field>
            <Field label="Description" full><textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <Field label="Category"><select value={editing.category || 'School'} onChange={(e) => setEditing({ ...editing, category: e.target.value as any })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Subject"><select value={editing.subject_id || ''} onChange={(e) => setEditing({ ...editing, subject_id: e.target.value ? Number(e.target.value) : null })}><option value="">— none —</option>{props.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Priority"><select value={editing.priority || 'P2'} onChange={(e) => setEditing({ ...editing, priority: e.target.value as any })}><option>P1</option><option>P2</option><option>P3</option></select></Field>
            <Field label="Status"><select value={editing.status || 'Inbox'} onChange={(e) => setEditing({ ...editing, status: e.target.value as any })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Due"><input type="datetime-local" value={toLocalInput(editing.due_at)} onChange={(e) => setEditing({ ...editing, due_at: fromLocalInput(e.target.value) })} /></Field>
            <Field label="Scheduled"><input type="datetime-local" value={toLocalInput(editing.scheduled_at)} onChange={(e) => setEditing({ ...editing, scheduled_at: fromLocalInput(e.target.value) })} /></Field>
            <Field label="Est. minutes"><input type="number" min={0} max={1440} value={editing.estimated_minutes ?? ''} onChange={(e) => setEditing({ ...editing, estimated_minutes: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <Field label="Actual minutes"><input type="number" min={0} max={1440} value={editing.actual_minutes ?? ''} onChange={(e) => setEditing({ ...editing, actual_minutes: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <Field label="Recurrence"><select value={editing.recurrence || ''} onChange={(e) => setEditing({ ...editing, recurrence: e.target.value })}><option value="">none</option><option value="daily">daily</option><option value="weekly">weekly</option></select></Field>
            <Field label="Tags (comma separated)"><input value={(() => { try { return (JSON.parse(editing.tags || '[]') as string[]).join(', '); } catch { return ''; } })()} onChange={(e) => setEditing({ ...editing, tags: JSON.stringify(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)) })} /></Field>
            <Field label="Notes" full><textarea value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
          </div>
          {editing.id ? <SubtaskManager taskId={editing.id} /> : <p className="micro faint" style={{ margin: '12px 0 0' }}>Save the task first, then break it into subtasks.</p>}
        </Modal>
      )}
      {confirmDel !== null && (
        <Confirm message="Delete this task? Completed history for this task is removed too." onNo={() => setConfirmDel(null)} onYes={() => { void api().remove('tasks', confirmDel).then(() => { setConfirmDel(null); void refresh(); props.toast('Task deleted.'); }); }} />
      )}
    </div>
  );
}

function SubtaskManager(props: { taskId: number }) {
  const [subs, setSubs] = useState<Array<{ id: number; title: string; done: number }>>([]);
  const [draft, setDraft] = useState('');

  const load = async () => {
    try {
      const all: any[] = await api().list('subtasks', 'position ASC', 1000);
      setSubs(all.filter((s) => s.task_id === props.taskId).map((s) => ({ id: s.id, title: s.title, done: s.done })));
    } catch { /* ignore */ }
  };

  useEffect(() => { void load(); }, [props.taskId]);

  async function add() {
    if (!draft.trim()) return;
    await api().create('subtasks', { task_id: props.taskId, title: draft.trim(), done: 0, position: subs.length });
    setDraft('');
    await load();
  }

  async function toggle(s: { id: number; done: number }) {
    await api().update('subtasks', s.id, { done: s.done ? 0 : 1 });
    await load();
  }

  async function remove(id: number) {
    await api().remove('subtasks', id);
    await load();
  }

  const doneCount = subs.filter((s) => s.done).length;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="panel-head"><h3>Subtasks · {doneCount}/{subs.length}</h3></div>
      {subs.length > 0 && (
        <div className="rows" style={{ marginBottom: 8 }}>
          {subs.map((s) => (
            <div key={s.id} className={`trow ${s.done ? 'done' : ''}`}>
              <button className={`check square-check ${s.done ? 'on' : ''}`} onClick={() => void toggle(s)} aria-label={`Toggle ${s.title}`}>
                {s.done ? <IconCheck size={11} /> : null}
              </button>
              <div className="grow"><div className="t" style={{ fontWeight: 500 }}>{s.title}</div></div>
              <span className="acts"><IconBtn label="Delete subtask" danger onClick={() => void remove(s.id)}><IconTrash size={13} /></IconBtn></span>
            </div>
          ))}
        </div>
      )}
      <div className="row">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder="Break it down — one small step" style={{ flex: 1 }} aria-label="New subtask" />
        <Button size="sm" variant="subtle" onClick={() => void add()}><IconPlus size={13} />Add</Button>
      </div>
    </div>
  );
}
