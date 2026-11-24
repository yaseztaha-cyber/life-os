import React, { useState } from 'react';
import { api } from '../lib/api';
import { useTable, toLocalInput, fromLocalInput } from '../lib/hooks';
import { Modal, EmptyState, Pill, Confirm, Button, IconBtn, Field, SafeLink } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconTrophy } from '../components/icons';
import type { Competition } from '../../shared/types';
import { fmtDate } from '../lib/time';

const STATUSES = ['Discovering', 'Checking eligibility', 'Considering', 'Committed', 'Preparing', 'Submitted', 'Completed', 'Not pursuing'];

export default function CompetitionsPage(props: { toast: (m: string, e?: boolean) => void }) {
  const { rows, refresh } = useTable<Competition>('competitions', 'id DESC');
  const [edit, setEdit] = useState<(Partial<Competition> & { id?: number }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [del, setDel] = useState<number | null>(null);
  const [filter, setFilter] = useState('All');

  const list = rows.filter((r) => filter === 'All' || r.status === filter);
  const committed = rows.filter((r) => r.status === 'Committed' || r.status === 'Preparing').length;

  async function save() {
    if (!edit?.name?.trim()) { setErr('Name is required.'); return; }
    if ((edit.status === 'Committed' || edit.status === 'Preparing') && !edit.next_action?.trim()) {
      setErr('Committed competitions need a concrete next action — and a capacity tradeoff below.');
      return;
    }
    const p = { name: edit.name.trim(), organizer: edit.organizer || '', url: edit.url || '', eligibility: edit.eligibility || '', deadline: edit.deadline || null, cost: edit.cost || '', deliverables: edit.deliverables || '', est_hours: edit.est_hours ?? null, status: edit.status || 'Discovering', next_action: edit.next_action || '', notes: edit.notes || '' };
    if (edit.id) await api().update('competitions', edit.id, p); else await api().create('competitions', p);
    setEdit(null); setErr(null); await refresh(); props.toast('Competition saved.');
  }

  return (
    <div className="stack">
      <div className="spread">
        <p className="small faint" style={{ margin: 0, maxWidth: 560 }}>
          <b className="num">{committed}</b> committed. Rule: a Committed entry must name what gets reduced or paused — interesting is not a plan.
        </p>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Status" style={{ maxWidth: 190 }}>
          <option>All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <Button onClick={() => { setErr(null); setEdit({ name: '', status: 'Discovering' }); }}><IconPlus size={15} />Competition</Button>
      </div>

      {list.length === 0 ? (
        <div className="panel"><EmptyState icon={<IconTrophy size={20} />} title="No competitions tracked" body="Discover opportunities, check eligibility, and only commit when capacity allows." /></div>
      ) : (
        <div className="grid cols-2">
          {list.map((c) => (
            <div key={c.id} className="panel">
              <div className="spread" style={{ marginBottom: 4 }}>
                <h4 style={{ margin: 0 }}>{c.name}</h4>
                <Pill text={c.status} kind={c.status === 'Committed' || c.status === 'Preparing' ? 'doing' : c.status === 'Completed' || c.status === 'Submitted' ? 'done' : 'muted'} />
              </div>
              <div className="micro faint num" style={{ marginBottom: 6 }}>
                {c.organizer || 'No organizer'}{c.deadline ? ` · deadline ${fmtDate(c.deadline)}` : ' · no deadline'}{c.est_hours ? ` · ~${c.est_hours}h prep` : ''}
              </div>
              <div className="small"><span className="faint">Next: </span>{c.next_action || '—'}</div>
              {c.notes ? <div className="small"><span className="faint">Tradeoff: </span>{c.notes}</div> : null}
              {c.url ? <div className="small" style={{ marginTop: 4 }}><SafeLink url={c.url} /></div> : null}
              <div className="row" style={{ marginTop: 10 }}>
                <Button size="sm" variant="subtle" onClick={() => { setErr(null); setEdit({ ...c }); }}><IconEdit size={13} />Edit</Button>
                <span style={{ flex: 1 }} />
                <IconBtn label="Delete" danger onClick={() => setDel(c.id)}><IconTrash size={14} /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <Modal title="Competition" onClose={() => setEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => void save()}>Save</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Name"><input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <Field label="Organizer"><input value={edit.organizer || ''} onChange={(e) => setEdit({ ...edit, organizer: e.target.value })} /></Field>
            <Field label="Official URL"><input value={edit.url || ''} onChange={(e) => setEdit({ ...edit, url: e.target.value })} placeholder="https://…" /></Field>
            <Field label="Deadline"><input type="datetime-local" value={toLocalInput(edit.deadline)} onChange={(e) => setEdit({ ...edit, deadline: fromLocalInput(e.target.value) })} /></Field>
            <Field label="Status"><select value={edit.status || 'Discovering'} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Est. prep hours"><input type="number" min={0} value={edit.est_hours ?? ''} onChange={(e) => setEdit({ ...edit, est_hours: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <Field label="Cost"><input value={edit.cost || ''} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} placeholder="Free / 200 EGP…" /></Field>
            <Field label="Eligibility" full><textarea value={edit.eligibility || ''} onChange={(e) => setEdit({ ...edit, eligibility: e.target.value })} /></Field>
            <Field label="Deliverables" full><textarea value={edit.deliverables || ''} onChange={(e) => setEdit({ ...edit, deliverables: e.target.value })} /></Field>
            <Field label="Next action (required before Committed)" full><input value={edit.next_action || ''} onChange={(e) => setEdit({ ...edit, next_action: e.target.value })} /></Field>
            <Field label="Capacity tradeoff — what gets reduced or paused?" full><textarea value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="e.g. Pause the second CS50 session while preparing" /></Field>
          </div>
        </Modal>
      )}
      {del !== null && <Confirm message="Delete this competition?" onNo={() => setDel(null)} onYes={() => { void api().remove('competitions', del).then(() => { setDel(null); void refresh(); }); }} />}
    </div>
  );
}
