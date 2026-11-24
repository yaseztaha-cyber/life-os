import React, { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useTable, toLocalInput, fromLocalInput } from '../lib/hooks';
import { Modal, EmptyState, Pill, Confirm, Button, IconBtn, Field, Seg, Dots } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconFlag } from '../components/icons';
import { canTransitionBacklog } from '../../shared/logic';
import type { Subject, BacklogItem, Assessment, Task, StudySession } from '../../shared/types';
import { fmtDateTime, fmtDate } from '../lib/time';

type Tab = 'subjects' | 'backlog' | 'assess';

export default function SchoolPage(props: { toast: (m: string, e?: boolean) => void; subjects: Subject[]; refreshSubjects: () => void }) {
  const { subjects } = props;
  const { rows: backlog, refresh: refreshBacklog } = useTable<BacklogItem>('backlog_items', 'id DESC');
  const { rows: assessments, refresh: refreshAssess } = useTable<Assessment>('assessments', 'date_at ASC');
  const { rows: tasks } = useTable<Task>('tasks', 'id DESC');
  const { rows: sessions } = useTable<StudySession>('study_sessions', 'id DESC');
  const [selSubject, setSelSubject] = useState<number | ''>('');
  const [tab, setTab] = useState<Tab>('subjects');
  const [showSubj, setShowSubj] = useState<(Partial<Subject> & { id?: number }) | null>(null);
  const [showBacklog, setShowBacklog] = useState<(Partial<BacklogItem> & { id?: number }) | null>(null);
  const [showAssess, setShowAssess] = useState<(Partial<Assessment> & { id?: number }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [del, setDel] = useState<{ table: string; id: number } | null>(null);
  const [blFilter, setBlFilter] = useState('All');
  const [detailId, setDetailId] = useState<number | null>(null);

  const activeSubjects = useMemo(() => subjects.filter((s) => !s.archived), [subjects]);
  const sel = subjects.find((s) => s.id === selSubject) || null;
  const blCounts = useMemo(() => ({
    red: backlog.filter((b) => b.status === 'red').length,
    yellow: backlog.filter((b) => b.status === 'yellow').length,
    green: backlog.filter((b) => b.status === 'green').length
  }), [backlog]);
  const selBacklog = backlog.filter((b) => (selSubject === '' || b.subject_id === selSubject) && (blFilter === 'All' || b.status === blFilter));
  const selTasks = tasks.filter((t) => (selSubject === '' || t.subject_id === selSubject) && t.status !== 'Completed' && t.status !== 'Cancelled').slice(0, 8);
  const selSessions = sessions.filter((s) => (selSubject === '' || s.subject_id === selSubject) && s.status === 'completed').slice(0, 6);
  const selAssess = assessments.filter((a) => selSubject === '' || a.subject_id === selSubject);
  const openHw = tasks.filter((t) => t.category === 'Homework' && t.status !== 'Completed' && t.status !== 'Cancelled').length;

  async function saveSubject() {
    if (!showSubj) return;
    if (!showSubj.name?.trim()) { setErr('Subject name is required.'); return; }
    const payload = { name: showSubj.name.trim(), color: showSubj.color || '#7c8aff', archived: showSubj.archived || 0, current_unit: showSubj.current_unit || '', current_topic: showSubj.current_topic || '', understanding: showSubj.understanding || 3, next_action: showSubj.next_action || '', notes: showSubj.notes || '' };
    if (showSubj.id) await api().update('subjects', showSubj.id, payload);
    else await api().create('subjects', payload);
    setShowSubj(null); setErr(null);
    props.refreshSubjects();
    props.toast('Subject saved.');
  }

  async function saveBacklog() {
    if (!showBacklog) return;
    if (!showBacklog.topic?.trim()) { setErr('Topic is required.'); return; }
    if (showBacklog.id) {
      const prev = backlog.find((b) => b.id === showBacklog.id);
      if (prev && showBacklog.status && !canTransitionBacklog(prev.status, showBacklog.status)) {
        setErr('Red cannot jump straight to green — move through yellow with practice evidence first.');
        return;
      }
    }
    const payload = { subject_id: showBacklog.subject_id || null, topic: showBacklog.topic.trim(), difficulty_desc: showBacklog.difficulty_desc || '', prerequisite: showBacklog.prerequisite || '', status: showBacklog.status || 'red', priority: showBacklog.priority || 'P2', deadline: showBacklog.deadline || null, estimated_minutes: showBacklog.estimated_minutes ?? null, last_attempted: showBacklog.last_attempted || null, next_review: showBacklog.next_review || null, notes: showBacklog.notes || '', evidence: showBacklog.evidence || '' };
    if (showBacklog.id) await api().update('backlog_items', showBacklog.id, payload);
    else await api().create('backlog_items', payload);
    setShowBacklog(null); setErr(null);
    await refreshBacklog();
    props.toast('Backlog item saved.');
  }

  async function saveAssess() {
    if (!showAssess) return;
    if (!showAssess.title?.trim()) { setErr('Title is required.'); return; }
    const payload = { subject_id: showAssess.subject_id || null, title: showAssess.title.trim(), kind: showAssess.kind || 'quiz', date_at: showAssess.date_at || null, confidence: showAssess.confidence || 3, checklist: showAssess.checklist || '[]', notes: showAssess.notes || '', done: showAssess.done || 0 };
    if (showAssess.id) await api().update('assessments', showAssess.id, payload);
    else await api().create('assessments', payload);
    setShowAssess(null); setErr(null);
    await refreshAssess();
    props.toast('Saved.');
  }

  async function makeRecoveryTask(b: BacklogItem) {
    await api().create('tasks', { title: `Recover: ${b.topic}`, description: b.difficulty_desc, category: 'Backlog recovery', subject_id: b.subject_id, priority: b.priority, status: 'Planned', estimated_minutes: b.estimated_minutes || 45, notes: `Prereq: ${b.prerequisite || '—'}` });
    await api().update('backlog_items', b.id, { last_attempted: new Date().toISOString() });
    await refreshBacklog();
    props.toast('Recovery task created in Tasks.');
  }

  return (
    <div className="stack">
      <div className="spread">
        <Seg<Tab> value={tab} onChange={setTab} options={[{ value: 'subjects', label: `Subjects · ${activeSubjects.length}` }, { value: 'backlog', label: `Backlog · ${blCounts.red + blCounts.yellow}` }, { value: 'assess', label: `Homework · ${openHw}` }]} />
        <span style={{ flex: 1 }} />
        <select value={selSubject} onChange={(e) => setSelSubject(e.target.value === '' ? '' : Number(e.target.value))} aria-label="Subject" style={{ maxWidth: 190 }}>
          <option value="">All subjects</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Button variant="ghost" onClick={() => { setErr(null); setShowSubj({ name: '', understanding: 3 }); }}><IconPlus size={15} />Subject</Button>
        <Button onClick={() => { setErr(null); setShowBacklog({ topic: '', status: 'red', priority: 'P2', subject_id: selSubject === '' ? null : selSubject }); }}><IconPlus size={15} />Backlog topic</Button>
      </div>

      {tab === 'subjects' && (
        <div className="grid cols-main">
          <div className="panel flush">
            <div className="rows">
              {(selSubject === '' ? activeSubjects : activeSubjects.filter((s) => s.id === selSubject)).map((s) => {
                const bl = backlog.filter((b) => b.subject_id === s.id);
                const hw = tasks.filter((t) => t.subject_id === s.id && t.category === 'Homework' && t.status !== 'Completed' && t.status !== 'Cancelled').length;
                return (
                  <div key={s.id} className="trow" style={{ alignItems: 'flex-start', padding: '12px', cursor: 'pointer' }} onClick={() => setDetailId(s.id)}>
                    <span className="dot" style={{ background: s.color, marginTop: 6, width: 10, height: 10 }} />
                    <div className="grow">
                      <div className="spread">
                        <b>{s.name}</b>
                        <span className="row"><Dots value={s.understanding} />{bl.filter((b) => b.status === 'red').length > 0 && <Pill text={`${bl.filter((b) => b.status === 'red').length} red`} />}{hw > 0 && <Pill text={`${hw} hw`} kind="P2" />}</span>
                      </div>
                      <div className="m">{s.current_unit || 'No unit set'}{s.current_topic ? ` · ${s.current_topic}` : ''}</div>
                      <div className="small" style={{ marginTop: 3 }}><span className="faint">Next: </span>{s.next_action || '—'}</div>
                    </div>
                    <span className="acts" onClick={(e) => e.stopPropagation()}>
                      <IconBtn label="Backlog" onClick={() => { setSelSubject(s.id); setTab('backlog'); }}><IconFlag size={14} /></IconBtn>
                      <IconBtn label="Edit subject" onClick={() => { setErr(null); setShowSubj({ ...s }); }}><IconEdit size={14} /></IconBtn>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="stack">
            <div className="panel">
              <div className="panel-head"><h3>{sel ? sel.name : 'Across subjects'}</h3></div>
              <div className="small" style={{ marginBottom: 6 }}><span className="faint">Open tasks · </span><b className="num">{selTasks.length}</b></div>
              {selTasks.length === 0 ? <p className="small faint" style={{ margin: 0 }}>Nothing open.</p> : selTasks.slice(0, 5).map((t) => <div key={t.id} className="small" style={{ padding: '3px 0' }}>• {t.title} <span className="faint">({t.category})</span></div>)}
              <hr className="divider" />
              <div className="small" style={{ marginBottom: 6 }}><span className="faint">Recent sessions</span></div>
              {selSessions.length === 0 ? <p className="small faint" style={{ margin: 0 }}>No completed sessions yet.</p> : selSessions.map((s) => <div key={s.id} className="small num" style={{ padding: '3px 0' }}>{fmtDateTime(s.started_at)} · {s.topic || s.objective} ({s.actual_minutes ?? s.planned_minutes}m)</div>)}
            </div>
          </div>
        </div>
      )}

      {tab === 'backlog' && (
        <div className="stack">
          <div className="spread">
            <p className="small faint" style={{ margin: 0, maxWidth: 620 }}>Identify the exact difficulty → one next action → recovery task → attempt independently → log mistakes → update status with evidence. Completing a task never auto-marks green.</p>
            <Seg value={blFilter} onChange={setBlFilter} options={[{ value: 'All', label: 'All' }, { value: 'red', label: `Red · ${blCounts.red}` }, { value: 'yellow', label: `Yellow · ${blCounts.yellow}` }, { value: 'green', label: `Green · ${blCounts.green}` }]} />
          </div>
          {selBacklog.length === 0 ? (
            <div className="panel"><EmptyState icon={<IconFlag size={20} />} title="No backlog topics here" body="Red = learn from scratch. Yellow = practice with mistakes. Green = mastered with evidence." /></div>
          ) : (
            <div className="grid cols-2">
              {selBacklog.map((b) => (
                <div key={b.id} className="panel">
                  <div className="spread" style={{ marginBottom: 6 }}>
                    <div className="row"><Pill text={b.status} /><Pill text={b.priority} /></div>
                    <span className="micro faint num">review {fmtDate(b.next_review)}</span>
                  </div>
                  <h4 style={{ margin: '0 0 2px' }}>{b.topic}</h4>
                  <div className="micro faint" style={{ marginBottom: 8 }}>{subjects.find((s) => s.id === b.subject_id)?.name || 'No subject'}</div>
                  <div className="small"><span className="faint">Stuck on: </span>{b.difficulty_desc || '—'}</div>
                  <div className="small"><span className="faint">Prereq: </span>{b.prerequisite || '—'}</div>
                  {b.evidence ? <div className="small"><span className="faint">Evidence: </span>{b.evidence}</div> : null}
                  <div className="row" style={{ marginTop: 10 }}>
                    <Button size="sm" variant="subtle" onClick={() => { setErr(null); setShowBacklog({ ...b }); }}><IconEdit size={13} />Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => void makeRecoveryTask(b)}><IconPlus size={13} />Recovery task</Button>
                    <span style={{ flex: 1 }} />
                    <IconBtn label="Delete" danger onClick={() => setDel({ table: 'backlog_items', id: b.id })}><IconTrash size={14} /></IconBtn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'assess' && (
        <div className="stack">
          <div className="spread"><span style={{ flex: 1 }} /><Button onClick={() => { setErr(null); setShowAssess({ title: '', kind: 'homework', confidence: 3, subject_id: selSubject === '' ? null : selSubject }); }}><IconPlus size={15} />Homework / assessment</Button></div>
          {selAssess.length === 0 ? (
            <div className="panel"><EmptyState icon={<IconEdit size={20} />} title="Nothing scheduled" body="Add homework and exam dates with confidence ratings and prep checklists." /></div>
          ) : (
            <div className="panel flush">
              <table className="tbl"><thead><tr><th>Title</th><th>Subject</th><th>Type</th><th>Date</th><th>Conf.</th><th></th></tr></thead>
                <tbody>{selAssess.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.title}</b></td>
                    <td className="small muted">{subjects.find((s) => s.id === a.subject_id)?.name || '—'}</td>
                    <td><Pill text={a.kind} kind="muted" /></td>
                    <td className="small num">{fmtDateTime(a.date_at)}</td>
                    <td><Dots value={a.confidence} /></td>
                    <td><div className="row" style={{ justifyContent: 'flex-end' }}>
                      <IconBtn label="Edit" onClick={() => { setErr(null); setShowAssess({ ...a }); }}><IconEdit size={14} /></IconBtn>
                      <IconBtn label="Delete" danger onClick={() => setDel({ table: 'assessments', id: a.id })}><IconTrash size={14} /></IconBtn>
                    </div></td>
                  </tr>
                ))}</tbody></table>
            </div>
          )}
        </div>
      )}

      {showSubj && (
        <Modal title={showSubj.id ? 'Edit subject' : 'New subject'} onClose={() => setShowSubj(null)}
          footer={<><Button variant="ghost" onClick={() => setShowSubj(null)}>Cancel</Button><Button onClick={() => void saveSubject()}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Name"><input value={showSubj.name || ''} onChange={(e) => setShowSubj({ ...showSubj, name: e.target.value })} autoFocus /></Field>
            <Field label="Color"><input type="color" value={showSubj.color || '#7c8aff'} onChange={(e) => setShowSubj({ ...showSubj, color: e.target.value })} style={{ height: 32, padding: 4 }} /></Field>
            <Field label="Current unit"><input value={showSubj.current_unit || ''} onChange={(e) => setShowSubj({ ...showSubj, current_unit: e.target.value })} /></Field>
            <Field label="Current topic"><input value={showSubj.current_topic || ''} onChange={(e) => setShowSubj({ ...showSubj, current_topic: e.target.value })} /></Field>
            <Field label="Understanding (1–5)"><input type="number" min={1} max={5} value={showSubj.understanding || 3} onChange={(e) => setShowSubj({ ...showSubj, understanding: Number(e.target.value) })} /></Field>
            <Field label="State"><select value={showSubj.archived || 0} onChange={(e) => setShowSubj({ ...showSubj, archived: Number(e.target.value) })}><option value={0}>Active</option><option value={1}>Archived</option></select></Field>
            <Field label="Next action" full><input value={showSubj.next_action || ''} onChange={(e) => setShowSubj({ ...showSubj, next_action: e.target.value })} placeholder="The single next concrete step" /></Field>
            <Field label="Notes" full><textarea value={showSubj.notes || ''} onChange={(e) => setShowSubj({ ...showSubj, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {showBacklog && (
        <Modal title={showBacklog.id ? 'Edit backlog topic' : 'New backlog topic'} sub="Be specific about what exactly fails" onClose={() => setShowBacklog(null)}
          footer={<><Button variant="ghost" onClick={() => setShowBacklog(null)}>Cancel</Button><Button onClick={() => void saveBacklog()}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Subject"><select value={showBacklog.subject_id || ''} onChange={(e) => setShowBacklog({ ...showBacklog, subject_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Topic"><input value={showBacklog.topic || ''} onChange={(e) => setShowBacklog({ ...showBacklog, topic: e.target.value })} autoFocus /></Field>
            <Field label="Status"><select value={showBacklog.status || 'red'} onChange={(e) => setShowBacklog({ ...showBacklog, status: e.target.value as any })}><option value="red">red — learn from scratch</option><option value="yellow">yellow — practice</option><option value="green">green — mastered</option></select></Field>
            <Field label="Priority"><select value={showBacklog.priority || 'P2'} onChange={(e) => setShowBacklog({ ...showBacklog, priority: e.target.value as any })}><option>P1</option><option>P2</option><option>P3</option></select></Field>
            <Field label="Exact difficulty — what can't you explain or solve?" full><textarea value={showBacklog.difficulty_desc || ''} onChange={(e) => setShowBacklog({ ...showBacklog, difficulty_desc: e.target.value })} /></Field>
            <Field label="Prerequisite"><input value={showBacklog.prerequisite || ''} onChange={(e) => setShowBacklog({ ...showBacklog, prerequisite: e.target.value })} /></Field>
            <Field label="Est. minutes"><input type="number" value={showBacklog.estimated_minutes ?? ''} onChange={(e) => setShowBacklog({ ...showBacklog, estimated_minutes: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <Field label="Deadline"><input type="datetime-local" value={toLocalInput(showBacklog.deadline)} onChange={(e) => setShowBacklog({ ...showBacklog, deadline: fromLocalInput(e.target.value) })} /></Field>
            <Field label="Next review"><input type="datetime-local" value={toLocalInput(showBacklog.next_review)} onChange={(e) => setShowBacklog({ ...showBacklog, next_review: fromLocalInput(e.target.value) })} /></Field>
            <Field label="Evidence of mastery — required before green" full><textarea value={showBacklog.evidence || ''} onChange={(e) => setShowBacklog({ ...showBacklog, evidence: e.target.value })} placeholder="Solved independently, can explain…" /></Field>
            <Field label="Notes" full><textarea value={showBacklog.notes || ''} onChange={(e) => setShowBacklog({ ...showBacklog, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {showAssess && (
        <Modal title="Homework / assessment" onClose={() => setShowAssess(null)}
          footer={<><Button variant="ghost" onClick={() => setShowAssess(null)}>Cancel</Button><Button onClick={() => void saveAssess()}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Title"><input value={showAssess.title || ''} onChange={(e) => setShowAssess({ ...showAssess, title: e.target.value })} autoFocus /></Field>
            <Field label="Subject"><select value={showAssess.subject_id || ''} onChange={(e) => setShowAssess({ ...showAssess, subject_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Type"><select value={showAssess.kind || 'homework'} onChange={(e) => setShowAssess({ ...showAssess, kind: e.target.value })}><option>homework</option><option>quiz</option><option>test</option><option>exam</option><option>lab</option></select></Field>
            <Field label="Date"><input type="datetime-local" value={toLocalInput(showAssess.date_at)} onChange={(e) => setShowAssess({ ...showAssess, date_at: fromLocalInput(e.target.value) })} /></Field>
            <Field label="Confidence (1–5)"><input type="number" min={1} max={5} value={showAssess.confidence || 3} onChange={(e) => setShowAssess({ ...showAssess, confidence: Number(e.target.value) })} /></Field>
            <Field label="State"><select value={showAssess.done || 0} onChange={(e) => setShowAssess({ ...showAssess, done: Number(e.target.value) })}><option value={0}>Open</option><option value={1}>Done</option></select></Field>
            <Field label="Preparation checklist (one per line)" full><textarea value={(() => { try { return (JSON.parse(showAssess.checklist || '[]') as string[]).join('\n'); } catch { return ''; } })()} onChange={(e) => setShowAssess({ ...showAssess, checklist: JSON.stringify(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)) })} /></Field>
            <Field label="Notes" full><textarea value={showAssess.notes || ''} onChange={(e) => setShowAssess({ ...showAssess, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {del && <Confirm message="Delete this record? This cannot be undone." onNo={() => setDel(null)} onYes={() => { void api().remove(del.table, del.id).then(() => { setDel(null); void refreshBacklog(); void refreshAssess(); props.refreshSubjects(); }); }} />}
      {detailId !== null && <SubjectDetail id={detailId} subjects={subjects} backlog={backlog} sessions={sessions} tasks={tasks} assessments={assessments} onClose={() => setDetailId(null)} onEdit={(s) => { setErr(null); setShowSubj({ ...s }); setDetailId(null); }} />}
    </div>
  );
}

function parseReflection(s: StudySession): { mistakes?: string; next?: string; understood?: string; completed?: string } {
  try {
    const r = JSON.parse(s.reflection || '{}');
    return r && typeof r === 'object' ? r : {};
  } catch { return {}; }
}

function SubjectDetail(props: {
  id: number; subjects: Subject[]; backlog: BacklogItem[]; sessions: StudySession[]; tasks: Task[]; assessments: Assessment[];
  onClose: () => void; onEdit: (s: Subject) => void;
}) {
  const s = props.subjects.find((x) => x.id === props.id);
  if (!s) return null;
  const bl = props.backlog.filter((b) => b.subject_id === s.id);
  const sess = props.sessions.filter((x) => x.subject_id === s.id && x.status === 'completed').slice(0, 8);
  const open = props.tasks.filter((t) => t.subject_id === s.id && t.status !== 'Completed' && t.status !== 'Cancelled').slice(0, 6);
  const upcoming = props.assessments.filter((a) => a.subject_id === s.id && !a.done).slice(0, 4);
  const mistakes = sess.map((x) => ({ when: x.started_at, ...parseReflection(x) })).filter((r) => r.mistakes || r.next);

  return (
    <Modal title={s.name} sub={`${s.current_unit || 'No unit'}${s.current_topic ? ` · ${s.current_topic}` : ''}`} wide onClose={props.onClose}
      footer={<><Button variant="ghost" onClick={props.onClose}>Close</Button><Button onClick={() => props.onEdit(s)}><IconEdit size={13} />Edit subject</Button></>}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <span className="small muted">Understanding</span>
        <Dots value={s.understanding} />
      </div>
      {s.next_action ? <div className="strip small" style={{ marginBottom: 12 }}><b>Next action:</b> {s.next_action}</div> : null}

      <p className="eyebrow">Mistake log · from session reflections</p>
      {mistakes.length === 0 ? <p className="small faint">No mistakes logged yet — they appear here when sessions record them.</p> : (
        <div className="rows" style={{ marginBottom: 12 }}>
          {mistakes.slice(0, 5).map((m, i) => (
            <div key={i} className="trow" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="small"><span className="faint">Mistakes: </span>{m.mistakes}</div>
                {m.next ? <div className="small"><span className="faint">Next: </span>{m.next}</div> : null}
                <div className="micro faint num">{fmtDateTime(m.when)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="eyebrow">Revision history · completed sessions</p>
      {sess.length === 0 ? <p className="small faint">No completed sessions for this subject yet.</p> : (
        <div className="small" style={{ marginBottom: 12 }}>
          {sess.slice(0, 6).map((x) => <div key={x.id} style={{ padding: '3px 0' }}>{fmtDateTime(x.started_at)} · {x.topic || x.objective} <span className="faint num">({x.actual_minutes ?? x.planned_minutes}m)</span></div>)}
        </div>
      )}

      <div className="grid cols-2">
        <div>
          <p className="eyebrow">Backlog · {bl.length}</p>
          {bl.length === 0 ? <p className="small faint">Clear.</p> : bl.slice(0, 5).map((b) => (
            <div key={b.id} className="small" style={{ padding: '2px 0' }}><Pill text={b.status} /> {b.topic}</div>
          ))}
        </div>
        <div>
          <p className="eyebrow">Open & upcoming</p>
          {open.map((t) => <div key={t.id} className="small" style={{ padding: '2px 0' }}>• {t.title}</div>)}
          {upcoming.map((a) => <div key={a.id} className="small" style={{ padding: '2px 0' }}>✎ {a.title} <span className="faint num">· {fmtDateTime(a.date_at)}</span></div>)}
          {open.length === 0 && upcoming.length === 0 ? <p className="small faint">Nothing open.</p> : null}
        </div>
      </div>

      {s.notes ? <><hr className="divider" /><p className="eyebrow">Notes & resources</p><p className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{s.notes}</p></> : null}
    </Modal>
  );
}
