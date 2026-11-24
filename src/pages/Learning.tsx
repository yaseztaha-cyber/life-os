import React, { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useTable } from '../lib/hooks';
import { Modal, EmptyState, Pill, Confirm, Button, IconBtn, Field, Seg, Bar } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconCode, IconCheck } from '../components/icons';
import type { LearningItem, EnglishPractice, Skill } from '../../shared/types';

const CS50_MODULES = ['Scratch', 'C', 'Arrays', 'Algorithms', 'Memory', 'Data Structures', 'Python', 'SQL', 'HTML/CSS/JS', 'Flask', 'Final Project'];
type Tab = 'cs50' | 'english' | 'skills';

export default function LearningPage(props: { toast: (m: string, e?: boolean) => void }) {
  const { rows: items, refresh: rI } = useTable<LearningItem>('learning_items', 'id DESC');
  const { rows: eng, refresh: rE } = useTable<EnglishPractice>('english_practice', 'practiced_at DESC');
  const { rows: skills, refresh: rS } = useTable<Skill>('skills', 'id DESC');
  const [tab, setTab] = useState<Tab>('cs50');
  const [csEdit, setCsEdit] = useState<(Partial<LearningItem> & { id?: number }) | null>(null);
  const [engEdit, setEngEdit] = useState<(Partial<EnglishPractice> & { id?: number }) | null>(null);
  const [skEdit, setSkEdit] = useState<(Partial<Skill> & { id?: number }) | null>(null);
  const [del, setDel] = useState<{ t: string; id: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refl, setRefl] = useState('');

  const cs50 = useMemo(() => items.filter((i) => i.track === 'cs50'), [items]);
  const csDone = cs50.filter((c) => c.status === 'done').length;
  const engWeek = eng.filter((e) => Date.now() - new Date(e.practiced_at).getTime() < 7 * 864e5);
  const engWeekMin = engWeek.reduce((s, e) => s + (e.minutes || 0), 0);
  const activeSkills = skills.filter((s) => s.active);

  async function saveCs() {
    if (!csEdit?.title?.trim()) { setErr('Title is required.'); return; }
    const p = { track: 'cs50', title: csEdit.title.trim(), module: csEdit.module || '', status: csEdit.status || 'not-started', detail: csEdit.detail || '', next_action: csEdit.next_action || '' };
    if (csEdit.id) await api().update('learning_items', csEdit.id, p); else await api().create('learning_items', p);
    setCsEdit(null); setErr(null); await rI(); props.toast('CS50 progress saved.');
  }

  return (
    <div className="stack">
      <div className="spread">
        <Seg<Tab> value={tab} onChange={setTab} options={[{ value: 'cs50', label: `CS50 · ${csDone}/${cs50.length}` }, { value: 'english', label: `English · ${engWeekMin}m` }, { value: 'skills', label: `Skills · ${activeSkills.length} active` }]} />
      </div>

      {tab === 'cs50' && (
        <div className="stack">
          <div className="strip small muted">Goal: understand programming well enough to <b>review</b> AI-generated code — attempt → name the obstacle → hint → retry → explain independently → test on a similar problem. No AI integration is faked here.</div>
          <div className="grid cols-main">
            <div className="panel">
              <div className="panel-head"><h3>Lessons & problem sets</h3><span className="tail"><Button size="sm" variant="subtle" onClick={() => { setErr(null); setCsEdit({ title: '', status: 'not-started' }); }}><IconPlus size={13} />Add</Button></span></div>
              {cs50.length === 0 ? <EmptyState icon={<IconCode size={20} />} title="No CS50 progress yet" body="Add lessons and problem sets per module. Record what is understood and what is difficult." /> : (
                <div className="rows">
                  {cs50.map((c) => (
                    <div key={c.id} className="trow">
                      <button className={`check ${c.status === 'done' ? 'on' : ''}`} onClick={() => { void api().update('learning_items', c.id, { status: c.status === 'done' ? 'doing' : 'done' }).then(() => void rI()); }} aria-label={`Toggle ${c.title}`}>
                        {c.status === 'done' && <IconCheck size={11} />}
                      </button>
                      <div className="grow">
                        <div className="t" style={{ fontWeight: 500 }}>{c.title}</div>
                        <div className="m">{c.module}{c.next_action ? ` · next: ${c.next_action}` : ''}</div>
                      </div>
                      <Pill text={c.status} />
                      <span className="acts">
                        <IconBtn label="Edit" onClick={() => { setErr(null); setCsEdit({ ...c }); }}><IconEdit size={14} /></IconBtn>
                        <IconBtn label="Delete" danger onClick={() => setDel({ t: 'learning_items', id: c.id })}><IconTrash size={14} /></IconBtn>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="stack">
              <div className="panel">
                <div className="panel-head"><h3>Progress</h3></div>
                <div className="row" style={{ marginBottom: 8 }}><Bar pct={cs50.length ? (csDone / cs50.length) * 100 : 0} /><b className="num small">{cs50.length ? Math.round((csDone / cs50.length) * 100) : 0}%</b></div>
                <p className="micro faint" style={{ margin: 0 }}>Modules: {CS50_MODULES.slice(0, 5).join(' → ')} → …</p>
              </div>
              <div className="panel">
                <div className="panel-head"><h3>Weekly reflection</h3></div>
                <textarea value={refl} onChange={(e) => setRefl(e.target.value)} placeholder="What did I attempt independently? Where did I ask AI too fast?" style={{ width: '100%' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'english' && (
        <div className="stack">
          <div className="spread">
            <p className="small faint" style={{ margin: 0 }}>Short sessions across listening · reading · vocabulary · writing · speaking · academic. <b className="num">{engWeekMin} min</b> this week.</p>
            <Button onClick={() => { setErr(null); setEngEdit({ skill: 'reading', minutes: 15 }); }}><IconPlus size={15} />Log practice</Button>
          </div>
          {eng.length === 0 ? <div className="panel"><EmptyState icon={<IconEdit size={20} />} title="No English practice logged" body="Log actual minutes with what you learned — not just checkboxes." /></div> : (
            <div className="panel flush">
              <table className="tbl"><thead><tr><th>Date</th><th>Skill</th><th>Min</th><th>Learned</th><th></th></tr></thead><tbody>
                {eng.slice(0, 50).map((e) => (
                  <tr key={e.id}>
                    <td className="small num">{new Date(e.practiced_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                    <td><Pill text={e.skill} kind="muted" /></td>
                    <td className="num"><b>{e.minutes}</b></td>
                    <td className="small">{e.what_learned || e.note || '—'}</td>
                    <td><div className="row" style={{ justifyContent: 'flex-end' }}>
                      <IconBtn label="Edit" onClick={() => { setErr(null); setEngEdit({ ...e }); }}><IconEdit size={14} /></IconBtn>
                      <IconBtn label="Delete" danger onClick={() => setDel({ t: 'english_practice', id: e.id })}><IconTrash size={14} /></IconBtn>
                    </div></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </div>
      )}

      {tab === 'skills' && (
        <div className="stack">
          <div className="spread">
            <p className="small faint" style={{ margin: 0 }}><b className="num">{activeSkills.length}</b> active — keep it small. Defer the rest to Later.</p>
            <Button onClick={() => { setErr(null); setSkEdit({ name: '', priority: 'P3', active: 1 }); }}><IconPlus size={15} />Skill</Button>
          </div>
          {skills.length === 0 ? <div className="panel"><EmptyState icon={<IconCode size={20} />} title="No skills tracked" body="Add why, target outcome, prerequisites, evidence, and next action." /></div> : (
            <div className="grid cols-2">
              {skills.map((s) => (
                <div key={s.id} className="panel">
                  <div className="spread" style={{ marginBottom: 4 }}>
                    <h4 style={{ margin: 0 }}>{s.name}</h4>
                    <Pill text={s.active ? 'active' : 'deferred'} kind={s.active ? 'doing' : 'muted'} />
                  </div>
                  <div className="small"><span className="faint">Why: </span>{s.reason || '—'}</div>
                  <div className="small"><span className="faint">Target: </span>{s.target || '—'}</div>
                  <div className="small"><span className="faint">Next: </span>{s.next_action || '—'}</div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <Button size="sm" variant="subtle" onClick={() => { setErr(null); setSkEdit({ ...s }); }}><IconEdit size={13} />Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => { void api().update('skills', s.id, { active: s.active ? 0 : 1 }).then(() => void rS()); }}>{s.active ? 'Defer' : 'Activate'}</Button>
                    <span style={{ flex: 1 }} />
                    <IconBtn label="Delete" danger onClick={() => setDel({ t: 'skills', id: s.id })}><IconTrash size={14} /></IconBtn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {csEdit && (
        <Modal title="CS50 item" onClose={() => setCsEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setCsEdit(null)}>Cancel</Button><Button onClick={() => void saveCs()}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Title"><input value={csEdit.title || ''} onChange={(e) => setCsEdit({ ...csEdit, title: e.target.value })} autoFocus /></Field>
            <Field label="Module"><select value={csEdit.module || ''} onChange={(e) => setCsEdit({ ...csEdit, module: e.target.value })}><option value="">—</option>{CS50_MODULES.map((m) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Status"><select value={csEdit.status || 'not-started'} onChange={(e) => setCsEdit({ ...csEdit, status: e.target.value })}><option>not-started</option><option>doing</option><option>done</option></select></Field>
            <Field label="Next action"><input value={csEdit.next_action || ''} onChange={(e) => setCsEdit({ ...csEdit, next_action: e.target.value })} /></Field>
            <Field label="Concepts understood / mistakes" full><textarea value={csEdit.detail || ''} onChange={(e) => setCsEdit({ ...csEdit, detail: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {engEdit && (
        <Modal title="English practice" onClose={() => setEngEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setEngEdit(null)}>Cancel</Button><Button onClick={() => {
            void (engEdit.id
              ? api().update('english_practice', engEdit.id, { skill: engEdit.skill, minutes: engEdit.minutes, note: engEdit.note || '', what_learned: engEdit.what_learned || '' })
              : api().create('english_practice', { skill: engEdit.skill, minutes: engEdit.minutes, note: engEdit.note || '', what_learned: engEdit.what_learned || '', practiced_at: new Date().toISOString() })
            ).then(() => { setEngEdit(null); void rE(); props.toast('Practice logged.'); });
          }}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Skill"><select value={engEdit.skill || 'reading'} onChange={(e) => setEngEdit({ ...engEdit, skill: e.target.value })}><option>listening</option><option>reading</option><option>vocabulary</option><option>writing</option><option>speaking</option><option>academic</option></select></Field>
            <Field label="Minutes"><input type="number" min={1} max={300} value={engEdit.minutes ?? 15} onChange={(e) => setEngEdit({ ...engEdit, minutes: Number(e.target.value) })} /></Field>
            <Field label="What I learned" full><textarea value={engEdit.what_learned || ''} onChange={(e) => setEngEdit({ ...engEdit, what_learned: e.target.value })} autoFocus /></Field>
            <Field label="Note" full><textarea value={engEdit.note || ''} onChange={(e) => setEngEdit({ ...engEdit, note: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {skEdit && (
        <Modal title="Skill" onClose={() => setSkEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setSkEdit(null)}>Cancel</Button><Button onClick={() => {
            if (!skEdit.name?.trim()) { setErr('Name is required.'); return; }
            if (skEdit.active && activeSkills.length >= 3 && !skEdit.id) { setErr('Keep active skills to 3 or fewer — defer something first.'); return; }
            void (skEdit.id ? api().update('skills', skEdit.id, { ...skEdit, name: skEdit.name.trim() }) : api().create('skills', { ...skEdit, name: skEdit.name.trim() })).then(() => { setSkEdit(null); setErr(null); void rS(); });
          }}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Name"><input value={skEdit.name || ''} onChange={(e) => setSkEdit({ ...skEdit, name: e.target.value })} autoFocus /></Field>
            <Field label="Priority"><select value={skEdit.priority || 'P3'} onChange={(e) => setSkEdit({ ...skEdit, priority: e.target.value as any })}><option>P1</option><option>P2</option><option>P3</option></select></Field>
            <Field label="Why learn it?" full><input value={skEdit.reason || ''} onChange={(e) => setSkEdit({ ...skEdit, reason: e.target.value })} /></Field>
            <Field label="Current level"><input value={skEdit.level || ''} onChange={(e) => setSkEdit({ ...skEdit, level: e.target.value })} placeholder="beginner" /></Field>
            <Field label="Target outcome"><input value={skEdit.target || ''} onChange={(e) => setSkEdit({ ...skEdit, target: e.target.value })} /></Field>
            <Field label="Evidence of progress" full><textarea value={skEdit.evidence || ''} onChange={(e) => setSkEdit({ ...skEdit, evidence: e.target.value })} /></Field>
            <Field label="Next action" full><input value={skEdit.next_action || ''} onChange={(e) => setSkEdit({ ...skEdit, next_action: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {del && <Confirm message="Delete this record?" onNo={() => setDel(null)} onYes={() => { void api().remove(del.t, del.id).then(() => { setDel(null); void rI(); void rE(); void rS(); }); }} />}
    </div>
  );
}
