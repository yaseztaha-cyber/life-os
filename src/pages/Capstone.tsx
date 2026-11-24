import React, { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useTable, toLocalInput, fromLocalInput } from '../lib/hooks';
import { Modal, EmptyState, Pill, Confirm, Button, IconBtn, Field, Seg, Bar, Stat } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconCheck, IconFlask } from '../components/icons';
import { budgetTotal } from '../../shared/logic';
import type { Milestone, Experiment, Source, Material, CapstoneEntry, Task } from '../../shared/types';
import { fmtDateTime } from '../lib/time';

type Tab = 'dash' | 'exp' | 'sources' | 'budget';

export default function CapstonePage(props: { toast: (m: string, e?: boolean) => void }) {
  const { rows: milestones, refresh: rM } = useTable<Milestone>('milestones', 'position ASC');
  const { rows: experiments, refresh: rE } = useTable<Experiment>('experiments', 'id DESC');
  const { rows: sources, refresh: rS } = useTable<Source>('sources', 'id DESC');
  const { rows: materials, refresh: rMat } = useTable<Material>('materials', 'id DESC');
  const { rows: entries, refresh: rEn } = useTable<CapstoneEntry>('capstone_entries', 'id DESC');
  const { rows: tasks } = useTable<Task>('tasks', 'id DESC');
  const [tab, setTab] = useState<Tab>('dash');
  const [mEdit, setMEdit] = useState<(Partial<Milestone> & { id?: number }) | null>(null);
  const [eEdit, setEEdit] = useState<(Partial<Experiment> & { id?: number }) | null>(null);
  const [sEdit, setSEdit] = useState<(Partial<Source> & { id?: number }) | null>(null);
  const [matEdit, setMatEdit] = useState<(Partial<Material> & { id?: number }) | null>(null);
  const [nEdit, setNEdit] = useState<(Partial<CapstoneEntry> & { id?: number }) | null>(null);
  const [del, setDel] = useState<{ t: string; id: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const done = milestones.filter((m) => m.status === 'done').length;
  const current = milestones.find((m) => m.status === 'doing') || milestones.find((m) => m.status !== 'done');
  const upcoming = milestones.filter((m) => m.status !== 'done' && m.due_at).sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0];
  const capTasks = tasks.filter((t) => t.category === 'Capstone' && t.status !== 'Completed' && t.status !== 'Cancelled');
  const total = useMemo(() => budgetTotal(materials.map((m) => ({ quantity: m.quantity, unit_price_egp: m.unit_price_egp }))), [materials]);
  const blockers = entries.filter((e) => e.kind === 'blocker' && !e.resolved);

  async function saveM() {
    if (!mEdit?.title?.trim()) { setErr('Title is required.'); return; }
    const p = { title: mEdit.title.trim(), phase: mEdit.phase || mEdit.title.trim(), description: mEdit.description || '', due_at: mEdit.due_at || null, status: mEdit.status || 'todo', position: mEdit.position ?? milestones.length, owner: mEdit.owner || 'Team 19215' };
    if (mEdit.id) await api().update('milestones', mEdit.id, p); else await api().create('milestones', p);
    setMEdit(null); setErr(null); await rM(); props.toast('Milestone saved.');
  }

  async function toggleM(m: Milestone) {
    const order = ['todo', 'doing', 'done'];
    const next = order[Math.min(2, order.indexOf(m.status) + 1)];
    await api().update('milestones', m.id, { status: next === 'todo' ? 'doing' : next });
    await rM();
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 750, letterSpacing: '-0.2px' }}>Bio brown</h2>
          <div className="small faint">Team 19215 · G11 S1 · Smart Sustainable Food Packaging · Change, Equilibrium, Cycles</div>
        </div>
        <Seg<Tab> value={tab} onChange={setTab} options={[{ value: 'dash', label: 'Dashboard' }, { value: 'exp', label: `Experiments · ${experiments.length}` }, { value: 'sources', label: `Sources · ${sources.length}` }, { value: 'budget', label: `Budget · ${total.toFixed(0)} EGP` }]} />
      </div>

      <div className="strip">
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="small"><b className="num">{done}/{milestones.length}</b> <span className="faint">milestones · current: <b style={{ color: 'var(--text)' }}>{current?.title || '—'}</b>{upcoming ? ` · next due ${fmtDateTime(upcoming.due_at)}` : ''}</span></span>
        </div>
        <Bar pct={milestones.length ? (done / milestones.length) * 100 : 0} good={done === milestones.length && milestones.length > 0} />
      </div>

      {tab === 'dash' && (
        <div className="grid cols-main">
          <div className="panel">
            <div className="panel-head"><h3>Milestones</h3><span className="tail"><Button size="sm" variant="subtle" onClick={() => { setErr(null); setMEdit({ title: '', status: 'todo' }); }}><IconPlus size={13} />Add</Button></span></div>
            <div className="rows">
              {milestones.map((m, i) => (
                <div key={m.id} className="trow">
                  <span className="micro faint num" style={{ width: 18 }}>{i + 1}</span>
                  <div className="grow">
                    <div className="t" style={{ fontWeight: m.status === 'done' ? 500 : 650, color: m.status === 'done' ? 'var(--text3)' : undefined }}>{m.title}</div>
                    <div className="m">{m.owner}{m.due_at ? ` · due ${fmtDateTime(m.due_at)}` : ''}</div>
                  </div>
                  <Pill text={m.status} />
                  <span className="acts">
                    <IconBtn label="Edit milestone" onClick={() => { setErr(null); setMEdit({ ...m }); }}><IconEdit size={14} /></IconBtn>
                    <IconBtn label={m.status === 'done' ? 'Reopen' : 'Advance'} onClick={() => void toggleM(m)}><IconCheck size={14} /></IconBtn>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="stack">
            {blockers.length > 0 && (
              <div className="strip bad small"><b>Blocked:</b> {blockers.map((b) => b.title).join(' · ')}</div>
            )}
            <div className="panel">
              <div className="panel-head"><h3>Blockers · decisions · next</h3><span className="tail"><Button size="sm" variant="subtle" onClick={() => setNEdit({ title: '', kind: 'next' })}><IconPlus size={13} /></Button></span></div>
              {entries.length === 0 ? <p className="small faint" style={{ margin: 0 }}>No notes yet.</p> : entries.slice(0, 7).map((e) => (
                <div key={e.id} className="trow">
                  <Pill text={e.kind} />
                  <div className="grow"><div className="t" style={{ fontWeight: 500 }}>{e.title}</div>{e.detail ? <div className="m">{e.detail.slice(0, 90)}</div> : null}</div>
                  <span className="acts">
                    <IconBtn label={e.resolved ? 'Reopen' : 'Resolve'} onClick={() => { void api().update('capstone_entries', e.id, { resolved: e.resolved ? 0 : 1 }).then(() => void rEn()); }}><IconCheck size={14} /></IconBtn>
                    <IconBtn label="Delete" danger onClick={() => setDel({ t: 'capstone_entries', id: e.id })}><IconTrash size={14} /></IconBtn>
                  </span>
                </div>
              ))}
            </div>
            <div className="panel">
              <div className="panel-head"><h3>Capstone tasks</h3><span className="tail micro faint num">{capTasks.length} open</span></div>
              {capTasks.length === 0 ? <p className="small faint" style={{ margin: 0 }}>No open capstone tasks. Create one from Tasks with category Capstone.</p>
                : capTasks.slice(0, 5).map((t) => <div key={t.id} className="small" style={{ padding: '3px 0' }}>• {t.title} <span className="faint">({t.status})</span></div>)}
              <hr className="divider" />
              <div className="small"><span className="faint">Latest experiment · </span>{experiments[0] ? <b>{experiments[0].title}</b> : 'none yet'}</div>
              {experiments[0]?.results ? <div className="small muted">{experiments[0].results.slice(0, 140)}</div> : <div className="micro faint">No results recorded — never fabricate.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'exp' && (
        <div className="stack">
          <div className="spread"><p className="small faint" style={{ margin: 0 }}>Question → hypothesis → variables → procedure → results → limitations. The indicator is not proof of food safety.</p><Button onClick={() => { setErr(null); setEEdit({ title: '' }); }}><IconPlus size={15} />Experiment</Button></div>
          {experiments.length === 0 ? <div className="panel"><EmptyState icon={<IconFlask size={20} />} title="No experiments" body="Record the full controlled-experiment loop with honest limitations." /></div> : (
            <div className="grid cols-2">
              {experiments.map((x) => (
                <div key={x.id} className="panel">
                  <h4 style={{ margin: '0 0 6px' }}>{x.title}</h4>
                  <ExpLine k="Question" v={x.research_question} />
                  <ExpLine k="Hypothesis" v={x.hypothesis} />
                  <div className="micro faint num" style={{ margin: '4px 0' }}>IV {x.iv || '—'} · DV {x.dv || '—'} · control {x.control_group || '—'}</div>
                  <ExpLine k="Results" v={x.results || '—'} />
                  <ExpLine k="Limits" v={x.limitations || '—'} />
                  <ExpLine k="Next" v={x.next_steps || '—'} />
                  <div className="row" style={{ marginTop: 10 }}>
                    <Button size="sm" variant="subtle" onClick={() => { setErr(null); setEEdit({ ...x }); }}><IconEdit size={13} />Edit</Button>
                    <span style={{ flex: 1 }} />
                    <IconBtn label="Delete" danger onClick={() => setDel({ t: 'experiments', id: x.id })}><IconTrash size={14} /></IconBtn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'sources' && (
        <div className="stack">
          <div className="spread"><span style={{ flex: 1 }} /><Button onClick={() => { setErr(null); setSEdit({ title: '' }); }}><IconPlus size={15} />Source</Button></div>
          {sources.length === 0 ? <div className="panel"><EmptyState icon={<IconFlask size={20} />} title="No sources" body="Track each source's claim, extracted evidence, and limitations." /></div> : (
            <div className="panel flush">
              <table className="tbl"><thead><tr><th>Title</th><th>Claim</th><th>Limits</th><th></th></tr></thead><tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.title}</b><br /><span className="micro faint">{s.author}{s.url ? ` · ${s.url.slice(0, 48)}` : ''}</span></td>
                    <td className="small">{s.claim || '—'}</td>
                    <td className="small">{s.limitations || '—'}</td>
                    <td><div className="row" style={{ justifyContent: 'flex-end' }}>
                      <IconBtn label="Edit" onClick={() => { setErr(null); setSEdit({ ...s }); }}><IconEdit size={14} /></IconBtn>
                      <IconBtn label="Delete" danger onClick={() => setDel({ t: 'sources', id: s.id })}><IconTrash size={14} /></IconBtn>
                    </div></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </div>
      )}

      {tab === 'budget' && (
        <div className="stack">
          <div className="spread">
            <div className="row"><Stat value={`${total.toFixed(2)}`} label="Total EGP · from saved entries" /></div>
            <Button onClick={() => { setErr(null); setMatEdit({ name: '', quantity: 1, unit_price_egp: 0 }); }}><IconPlus size={15} />Material</Button>
          </div>
          {materials.length === 0 ? <div className="panel"><EmptyState icon={<IconFlask size={20} />} title="No materials" body="Add real items with real EGP prices. Nothing is pre-filled." /></div> : (
            <div className="panel flush">
              <table className="tbl"><thead><tr><th>Material</th><th>Qty</th><th>Unit price</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td><b>{m.name}</b><br /><span className="micro faint">{m.intended_use}{m.supplier ? ` · ${m.supplier}` : ''}</span></td>
                    <td className="num small">{m.quantity} {m.unit}</td>
                    <td className="num small">{m.unit_price_egp}</td>
                    <td className="num"><b>{(m.quantity * m.unit_price_egp).toFixed(2)}</b></td>
                    <td><Pill text={m.purchase_status} kind={m.purchase_status === 'purchased' ? 'done' : 'muted'} /></td>
                    <td><div className="row" style={{ justifyContent: 'flex-end' }}>
                      <IconBtn label="Edit" onClick={() => { setErr(null); setMatEdit({ ...m }); }}><IconEdit size={14} /></IconBtn>
                      <IconBtn label="Delete" danger onClick={() => setDel({ t: 'materials', id: m.id })}><IconTrash size={14} /></IconBtn>
                    </div></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </div>
      )}

      {mEdit && (
        <Modal title="Milestone" onClose={() => setMEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setMEdit(null)}>Cancel</Button><Button onClick={() => void saveM()}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Title"><input value={mEdit.title || ''} onChange={(e) => setMEdit({ ...mEdit, title: e.target.value })} autoFocus /></Field>
            <Field label="Owner"><input value={mEdit.owner || ''} onChange={(e) => setMEdit({ ...mEdit, owner: e.target.value })} /></Field>
            <Field label="Status"><select value={mEdit.status || 'todo'} onChange={(e) => setMEdit({ ...mEdit, status: e.target.value })}><option>todo</option><option>doing</option><option>done</option></select></Field>
            <Field label="Due"><input type="datetime-local" value={toLocalInput(mEdit.due_at)} onChange={(e) => setMEdit({ ...mEdit, due_at: fromLocalInput(e.target.value) })} /></Field>
            <Field label="Description" full><textarea value={mEdit.description || ''} onChange={(e) => setMEdit({ ...mEdit, description: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {eEdit && (
        <Modal title="Experiment" wide onClose={() => setEEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setEEdit(null)}>Cancel</Button><Button onClick={() => {
            const p = { ...eEdit, title: eEdit.title!.trim() };
            if (!p.title) { setErr('Title is required.'); return; }
            void (eEdit.id ? api().update('experiments', eEdit.id, p) : api().create('experiments', p)).then(() => { setEEdit(null); setErr(null); void rE(); props.toast('Experiment saved.'); });
          }}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Title" full><input value={eEdit.title || ''} onChange={(e) => setEEdit({ ...eEdit, title: e.target.value })} autoFocus /></Field>
            {([['research_question', 'Research question'], ['hypothesis', 'Hypothesis'], ['iv', 'Independent variable'], ['dv', 'Dependent variable'], ['controlled_vars', 'Controlled variables'], ['control_group', 'Control group'], ['materials', 'Materials'], ['procedure', 'Procedure'], ['replicates', 'Replicates'], ['observations', 'Raw observations'], ['results', 'Results — never fabricate'], ['limitations', 'Limitations'], ['next_steps', 'Next steps']] as const).map(([k, label]) => (
              <Field key={k} label={label} full><textarea value={(eEdit as any)[k] || ''} onChange={(e) => setEEdit({ ...eEdit, [k]: e.target.value })} /></Field>
            ))}
          </div>
        </Modal>
      )}

      {sEdit && (
        <Modal title="Research source" onClose={() => setSEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setSEdit(null)}>Cancel</Button><Button onClick={() => {
            if (!sEdit.title?.trim()) { setErr('Title is required.'); return; }
            void (sEdit.id ? api().update('sources', sEdit.id, { ...sEdit, title: sEdit.title.trim() }) : api().create('sources', { ...sEdit, title: sEdit.title.trim() })).then(() => { setSEdit(null); setErr(null); void rS(); props.toast('Source saved.'); });
          }}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Title" full><input value={sEdit.title || ''} onChange={(e) => setSEdit({ ...sEdit, title: e.target.value })} autoFocus /></Field>
            <Field label="Author"><input value={sEdit.author || ''} onChange={(e) => setSEdit({ ...sEdit, author: e.target.value })} /></Field>
            <Field label="URL / DOI"><input value={sEdit.url || ''} onChange={(e) => setSEdit({ ...sEdit, url: e.target.value })} /></Field>
            <Field label="Type"><select value={sEdit.source_type || 'paper'} onChange={(e) => setSEdit({ ...sEdit, source_type: e.target.value })}><option>paper</option><option>book</option><option>video</option><option>docs</option><option>other</option></select></Field>
            <Field label="Pub date"><input value={sEdit.pub_date || ''} onChange={(e) => setSEdit({ ...sEdit, pub_date: e.target.value })} /></Field>
            <Field label="Relevant claim" full><textarea value={sEdit.claim || ''} onChange={(e) => setSEdit({ ...sEdit, claim: e.target.value })} /></Field>
            <Field label="Evidence" full><textarea value={sEdit.evidence || ''} onChange={(e) => setSEdit({ ...sEdit, evidence: e.target.value })} /></Field>
            <Field label="Limitations" full><textarea value={sEdit.limitations || ''} onChange={(e) => setSEdit({ ...sEdit, limitations: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {matEdit && (
        <Modal title="Material" onClose={() => setMatEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setMatEdit(null)}>Cancel</Button><Button onClick={() => {
            if (!matEdit.name?.trim()) { setErr('Name is required.'); return; }
            void (matEdit.id ? api().update('materials', matEdit.id, { ...matEdit, name: matEdit.name.trim() }) : api().create('materials', { ...matEdit, name: matEdit.name.trim() })).then(() => { setMatEdit(null); setErr(null); void rMat(); props.toast('Material saved.'); });
          }}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Name"><input value={matEdit.name || ''} onChange={(e) => setMatEdit({ ...matEdit, name: e.target.value })} autoFocus /></Field>
            <Field label="Quantity"><input type="number" min={0} value={matEdit.quantity ?? 1} onChange={(e) => setMatEdit({ ...matEdit, quantity: Number(e.target.value) })} /></Field>
            <Field label="Unit"><input value={matEdit.unit || ''} onChange={(e) => setMatEdit({ ...matEdit, unit: e.target.value })} placeholder="pcs / g / ml" /></Field>
            <Field label="Unit price (EGP)"><input type="number" min={0} value={matEdit.unit_price_egp ?? 0} onChange={(e) => setMatEdit({ ...matEdit, unit_price_egp: Number(e.target.value) })} /></Field>
            <Field label="Supplier"><input value={matEdit.supplier || ''} onChange={(e) => setMatEdit({ ...matEdit, supplier: e.target.value })} /></Field>
            <Field label="Status"><select value={matEdit.purchase_status || 'needed'} onChange={(e) => setMatEdit({ ...matEdit, purchase_status: e.target.value })}><option>needed</option><option>ordered</option><option>purchased</option></select></Field>
            <Field label="Intended use" full><input value={matEdit.intended_use || ''} onChange={(e) => setMatEdit({ ...matEdit, intended_use: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {nEdit && (
        <Modal title="Capstone note" onClose={() => setNEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setNEdit(null)}>Cancel</Button><Button onClick={() => { void api().create('capstone_entries', { kind: nEdit.kind || 'next', title: nEdit.title, detail: nEdit.detail || '' }).then(() => { setNEdit(null); void rEn(); }); }}>Save</Button></>}>
          <div className="form-grid">
            <Field label="Kind"><select value={nEdit.kind || 'next'} onChange={(e) => setNEdit({ ...e, kind: e.target.value })}><option value="blocker">blocker</option><option value="decision">decision</option><option value="next">next</option></select></Field>
            <Field label="Title"><input value={nEdit.title || ''} onChange={(e) => setNEdit({ ...nEdit, title: e.target.value })} autoFocus /></Field>
            <Field label="Detail" full><textarea value={nEdit.detail || ''} onChange={(e) => setNEdit({ ...nEdit, detail: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {del && <Confirm message="Delete this record? This cannot be undone." onNo={() => setDel(null)} onYes={() => { void api().remove(del.t, del.id).then(() => { setDel(null); void rE(); void rS(); void rMat(); void rEn(); void rM(); }); }} />}
    </div>
  );
}

function ExpLine(props: { k: string; v: string }) {
  if (!props.v || props.v === '—') return null;
  return <div className="small" style={{ padding: '2px 0' }}><span className="faint">{props.k}: </span>{props.v.length > 160 ? `${props.v.slice(0, 160)}…` : props.v}</div>;
}
