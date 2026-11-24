import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useTable } from '../lib/hooks';
import { lsGet, lsSet, lsDel } from '../lib/safe';
import { Modal, EmptyState, Pill, Button, IconBtn, Field, Confirm } from '../components/ui';
import { IconPlus, IconCheck, IconPlay, IconPause, IconTimer as IconTimerGlyph } from '../components/icons';
import { sessionAdherence } from '../../shared/logic';
import type { StudySession, Subject, Task } from '../../shared/types';
import { fmtDateTime } from '../lib/time';

const LS_ACTIVE = 'lifeos-active-session';
// A 'running' segment older than this is treated as interrupted (quit/crash
// without pause) rather than accrued. The main process also parks stale
// running sessions as paused at startup — this is the renderer half.
const STALE_SEGMENT_MS = 12 * 3600 * 1000;

export default function SessionsPage(props: { toast: (m: string, e?: boolean) => void; subjects: Subject[] }) {
  const { rows: sessions, refresh } = useTable<StudySession>('study_sessions', 'id DESC');
  const { rows: tasks } = useTable<Task>('tasks', 'id DESC');
  const [setup, setSetup] = useState<Partial<StudySession> | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0); // seconds, derived from base + live segment
  const [paused, setPaused] = useState(false);
  const [finish, setFinish] = useState<any | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const baseRef = useRef(0); // accumulated seconds before the live segment
  const anchorRef = useRef<number | null>(null); // live segment start (epoch ms)
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  const active = useMemo(() => sessions.find((s) => s.id === activeId) || null, [sessions, activeId]);

  // Recover after restart: the active session id survives in storage; the
  // accumulated minutes survive in the DB (actual_minutes as accumulator).
  useEffect(() => {
    const raw = lsGet(LS_ACTIVE);
    if (raw) {
      try {
        const { id } = JSON.parse(raw);
        if (typeof id === 'number') setActiveId(id);
      } catch { /* corrupt marker → ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach to the active session: rebuild base/anchor, detect stale segments.
  useEffect(() => {
    if (!active || active.status === 'completed' || active.status === 'cancelled') {
      anchorRef.current = null;
      return;
    }
    const base = Math.max(0, (active.actual_minutes || 0) * 60);
    baseRef.current = base;
    if (active.status === 'paused') {
      anchorRef.current = null;
      setPaused(true);
      setInterrupted(false);
      setElapsed(base);
      return;
    }
    // status === 'running'
    const segStart = active.started_at ? new Date(active.started_at).getTime() : NaN;
    if (!Number.isFinite(segStart) || Date.now() - segStart > STALE_SEGMENT_MS) {
      // Interrupted (quit/crash/restart without pause): park it, keep base.
      anchorRef.current = null;
      setPaused(true);
      setInterrupted(true);
      setElapsed(base);
      void api().update('study_sessions', active.id, { status: 'paused' })
        .then(() => refresh())
        .catch(() => { /* will retry on next load */ });
      return;
    }
    anchorRef.current = segStart;
    setPaused(false);
    setInterrupted(false);
    setElapsed(base + Math.floor((Date.now() - segStart) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.status]);

  // 1s tick while a live segment exists.
  useEffect(() => {
    if (!active || paused || anchorRef.current === null) return;
    const t = window.setInterval(() => {
      const a = anchorRef.current;
      if (a === null) return;
      setElapsed(baseRef.current + Math.floor((Date.now() - a) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [active, paused]);

  // Persist the accumulator every 60s while running, so a crash loses at
  // most one minute and a restart can resume from real progress.
  useEffect(() => {
    if (!active || paused || anchorRef.current === null) return;
    const t = window.setInterval(() => {
      void api().update('study_sessions', active.id, { actual_minutes: Math.floor(elapsedRef.current / 60) }).catch(() => { /* ignore */ });
    }, 60000);
    return () => window.clearInterval(t);
  }, [active, paused]);

  function currentElapsed(): number {
    const a = anchorRef.current;
    return a === null ? baseRef.current : baseRef.current + Math.floor((Date.now() - a) / 1000);
  }

  async function start() {
    if (!setup) return;
    if (!setup.objective?.trim()) { props.toast('Session objective is required.', true); return; }
    const id = await api().create('study_sessions', {
      subject_id: setup.subject_id || null,
      topic: setup.topic || '',
      objective: setup.objective.trim(),
      planned_minutes: setup.planned_minutes || 45,
      actual_minutes: 0,
      session_type: setup.session_type || 'focus',
      task_id: setup.task_id || null,
      difficulty: setup.difficulty || '',
      notes: setup.notes || '',
      started_at: new Date().toISOString(),
      status: 'running',
      reflection: '{}'
    });
    lsSet(LS_ACTIVE, JSON.stringify({ id }));
    baseRef.current = 0;
    anchorRef.current = Date.now();
    setActiveId(id);
    setElapsed(0);
    setPaused(false);
    setInterrupted(false);
    setSetup(null);
    await refresh();
  }

  async function pauseResume() {
    if (!active) return;
    if (!paused) {
      const done = currentElapsed();
      baseRef.current = done;
      anchorRef.current = null;
      setElapsed(done);
      setPaused(true);
      await api().update('study_sessions', active.id, { status: 'paused', actual_minutes: Math.floor(done / 60) });
    } else {
      baseRef.current = elapsedRef.current;
      anchorRef.current = Date.now();
      setPaused(false);
      setInterrupted(false);
      await api().update('study_sessions', active.id, { status: 'running', started_at: new Date().toISOString() });
    }
    await refresh();
  }

  async function cancel() {
    if (!active) return;
    setConfirmCancel(false);
    await api().update('study_sessions', active.id, { status: 'cancelled', ended_at: new Date().toISOString(), actual_minutes: Math.round(currentElapsed() / 60) });
    lsDel(LS_ACTIVE);
    anchorRef.current = null;
    setActiveId(null);
    await refresh();
  }

  async function submitFinish() {
    if (!active || !finish) return;
    const actual = Math.round(currentElapsed() / 60);
    await api().update('study_sessions', active.id, {
      status: 'completed',
      ended_at: new Date().toISOString(),
      actual_minutes: actual,
      notes: finish.notes || active.notes,
      reflection: JSON.stringify({ completed: finish.completed, understood: finish.understood, mistakes: finish.mistakes, independent: finish.independent, next: finish.next })
    });
    lsDel(LS_ACTIVE);
    anchorRef.current = null;
    setActiveId(null);
    setFinish(null);
    setElapsed(0);
    baseRef.current = 0;
    await refresh();
    props.toast(`Session logged: ${actual} min. Understanding over hours.`);
  }

  const bySubject = useMemo(() => {
    const map = new Map<number | string, number>();
    for (const s of sessions.filter((x) => x.status === 'completed')) {
      const k = s.subject_id ?? 'none';
      map.set(k, (map.get(k) || 0) + (s.actual_minutes ?? s.planned_minutes));
    }
    return [...map.entries()].map(([k, mins]) => ({ name: k === 'none' ? 'Unassigned' : props.subjects.find((x) => x.id === k)?.name || '—', mins }));
  }, [sessions, props.subjects]);

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="stack">
      {active && active.status !== 'completed' && active.status !== 'cancelled' ? (
        <div className="panel timer-hero">
          <p className="eyebrow">{paused ? 'Paused' : 'Focusing'} · {props.subjects.find((s) => s.id === active.subject_id)?.name || 'No subject'}{active.topic ? ` · ${active.topic}` : ''}</p>
          {interrupted && <div className="strip bad small" style={{ marginBottom: 10, textAlign: 'left' }}>Interrupted by quit/restart — timer was parked, no phantom hours added. Press Resume to continue from {Math.floor(baseRef.current / 60)}m.</div>}
          <div className="timer-digits num">{mmss}</div>
          <div className="timer-sub">{active.objective} · planned {active.planned_minutes}m</div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <Button variant="ghost" onClick={() => void pauseResume()}>{paused ? <><IconPlay size={14} />Resume</> : <><IconPause size={14} />Pause</>}</Button>
            <Button onClick={() => setFinish({ completed: '', understood: '', mistakes: '', independent: 'partially', next: '', notes: active.notes || '' })}><IconCheck size={14} />Finish</Button>
            <Button variant="subtle" onClick={() => setConfirmCancel(true)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="spread">
          <p className="small faint" style={{ margin: 0, maxWidth: 560 }}>Timer survives rerenders and restarts. Finishing asks for evidence — what you understood and your mistakes — not just minutes.</p>
          <Button onClick={() => setSetup({ planned_minutes: 45, session_type: 'focus' })}><IconPlus size={15} />New session</Button>
        </div>
      )}

      <div className="grid cols-2">
        <div className="panel">
          <div className="panel-head"><h3>Time by subject</h3><span className="tail micro faint">actual minutes</span></div>
          {bySubject.length === 0 ? <p className="small faint" style={{ margin: '2px 0' }}>No completed sessions yet.</p> : (
            <div className="rows">
              {bySubject.sort((a, b) => b.mins - a.mins).slice(0, 8).map((b) => (
                <div key={b.name} className="trow">
                  <div className="grow"><div className="t" style={{ fontWeight: 500 }}>{b.name}</div></div>
                  <div className="bar" style={{ width: 110 }}><div style={{ width: `${Math.min(100, (b.mins / Math.max(60, bySubject[0].mins)) * 100)}%` }} /></div>
                  <b className="num small">{b.mins}m</b>
                </div>
              ))}
            </div>
          )}
          <hr className="divider" />
          <div className="panel-head"><h3>Planned vs actual</h3></div>
          {sessions.filter((s) => s.status === 'completed').slice(0, 5).map((s) => {
            const adh = sessionAdherence(s.planned_minutes, s.actual_minutes);
            return <div key={s.id} className="small" style={{ padding: '3px 0' }}>{s.topic || s.objective} <span className="faint num">· {s.planned_minutes}m → {s.actual_minutes}m{adh !== null ? ` (${adh}%)` : ''}</span></div>;
          })}
        </div>
        <div className="panel">
          <div className="panel-head"><h3>History</h3><span className="tail micro faint num">{sessions.length}</span></div>
          {sessions.length === 0 ? <EmptyState icon={<IconTimerGlyph size={20} />} title="No sessions yet" body="Start a focused session with a clear objective." /> : (
            <div className="rows">
              {sessions.slice(0, 10).map((s) => (
                <div key={s.id} className="trow">
                  <div className="grow">
                    <div className="t" style={{ fontWeight: 500 }}>{s.topic || s.objective}</div>
                    <div className="m num">{fmtDateTime(s.started_at)} · {s.actual_minutes ?? s.planned_minutes}m of {s.planned_minutes}m · {props.subjects.find((x) => x.id === s.subject_id)?.name || '—'}</div>
                  </div>
                  <Pill text={s.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {setup && (
        <Modal title="New study session" sub="One objective, one topic, one timer" onClose={() => setSetup(null)}
          footer={<><Button variant="ghost" onClick={() => setSetup(null)}>Cancel</Button><Button onClick={() => void start()}><IconPlay size={14} />Start timer</Button></>}>
          <div className="form-grid">
            <Field label="Subject"><select value={setup.subject_id || ''} onChange={(e) => setSetup({ ...setup, subject_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{props.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Topic"><input value={setup.topic || ''} onChange={(e) => setSetup({ ...setup, topic: e.target.value })} /></Field>
            <Field label="Objective (required)" full><input value={setup.objective || ''} onChange={(e) => setSetup({ ...setup, objective: e.target.value })} placeholder="e.g. Solve 5 friction problems independently" autoFocus /></Field>
            <Field label="Planned minutes"><input type="number" min={5} max={180} value={setup.planned_minutes || 45} onChange={(e) => setSetup({ ...setup, planned_minutes: Number(e.target.value) })} /></Field>
            <Field label="Type"><select value={setup.session_type || 'focus'} onChange={(e) => setSetup({ ...setup, session_type: e.target.value })}><option>focus</option><option>revision</option><option>practice</option><option>reading</option></select></Field>
            <Field label="Related task"><select value={setup.task_id || ''} onChange={(e) => setSetup({ ...setup, task_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{tasks.filter((t) => t.status !== 'Completed').map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
            <Field label="Difficulty"><input value={setup.difficulty || ''} onChange={(e) => setSetup({ ...setup, difficulty: e.target.value })} placeholder="easy / medium / hard" /></Field>
            <Field label="Notes" full><textarea value={setup.notes || ''} onChange={(e) => setSetup({ ...setup, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {confirmCancel && <Confirm message="Cancel this session? It will be kept as cancelled with the minutes logged so far." onNo={() => setConfirmCancel(false)} onYes={() => void cancel()} />}

      {finish && (
        <Modal title="Finish session" sub="Reflection turns minutes into progress" onClose={() => setFinish(null)}
          footer={<><Button variant="ghost" onClick={() => setFinish(null)}>Back</Button><Button onClick={() => void submitFinish()}>Log {Math.round(elapsed / 60)}m session</Button></>}>
          <div className="form-grid">
            <Field label="What did I complete?" full><textarea value={finish.completed} onChange={(e) => setFinish({ ...finish, completed: e.target.value })} /></Field>
            <Field label="What did I understand?" full><textarea value={finish.understood} onChange={(e) => setFinish({ ...finish, understood: e.target.value })} /></Field>
            <Field label="What mistakes did I make?" full><textarea value={finish.mistakes} onChange={(e) => setFinish({ ...finish, mistakes: e.target.value })} /></Field>
            <Field label="Solve independently?"><select value={finish.independent} onChange={(e) => setFinish({ ...finish, independent: e.target.value })}><option>yes</option><option>partially</option><option>no</option></select></Field>
            <Field label="Next action"><input value={finish.next} onChange={(e) => setFinish({ ...finish, next: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
