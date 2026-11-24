import React, { useState } from 'react';
import { api } from '../lib/api';
import { useTable } from '../lib/hooks';
import { Modal, EmptyState, Confirm, Button, IconBtn, Field, Pill } from '../components/ui';
import { IconPlus, IconTrash, IconInbox, IconChevronR } from '../components/icons';
import type { InboxItem, LaterItem, Subject } from '../../shared/types';

export default function InboxPage(props: { toast: (m: string, e?: boolean) => void; subjects: Subject[] }) {
  void props.subjects;
  const { rows: inbox, refresh: rI } = useTable<InboxItem>('inbox_items', 'id DESC');
  const { rows: later, refresh: rL } = useTable<LaterItem>('later_items', 'id DESC');
  const [edit, setEdit] = useState<(Partial<InboxItem> & { id?: number }) | null>(null);
  const [laterEdit, setLaterEdit] = useState<(Partial<LaterItem> & { id?: number }) | null>(null);
  const [del, setDel] = useState<{ t: string; id: number } | null>(null);

  const fresh = inbox.filter((i) => !i.converted);
  const doneCount = inbox.filter((i) => i.converted).length;

  async function convert(item: InboxItem, target: 'task' | 'backlog' | 'later') {
    if (target === 'task') {
      await api().create('tasks', { title: item.title, description: item.detail, category: 'Personal', priority: 'P3', status: 'Inbox' });
    } else if (target === 'backlog') {
      await api().create('backlog_items', { topic: item.title, difficulty_desc: item.detail, status: 'red', priority: 'P3' });
    } else {
      await api().create('later_items', { title: item.title, reason_deferred: 'Moved from inbox', tradeoff: '' });
    }
    await api().update('inbox_items', item.id, { converted: 1 });
    await rI(); await rL();
    props.toast(`Converted to ${target}. Nothing discarded silently.`);
  }

  return (
    <div className="grid cols-main">
      <div className="stack">
        <div className="spread">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Inbox <span className="faint num">· {fresh.length}</span></h3>
          <Button onClick={() => setEdit({ title: '', kind: 'idea' })}><IconPlus size={15} />Capture</Button>
        </div>
        {fresh.length === 0 ? (
          <div className="panel"><EmptyState icon={<IconInbox size={20} />} title="Inbox zero" body="Capture tasks, ideas, deadlines and resources fast. Convert them — never silently discard." /></div>
        ) : (
          <div className="panel flush">
            <div className="rows">
              {fresh.map((i) => (
                <div key={i.id} className="trow" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="spread">
                      <b>{i.title}</b>
                      <Pill text={i.kind} kind="muted" />
                    </div>
                    {i.detail ? <div className="small muted" style={{ margin: '2px 0 8px' }}>{i.detail}</div> : <div style={{ height: 6 }} />}
                    <div className="row wrap">
                      <Button size="sm" variant="subtle" onClick={() => void convert(i, 'task')}>To task<IconChevronR size={12} /></Button>
                      <Button size="sm" variant="subtle" onClick={() => void convert(i, 'backlog')}>To backlog<IconChevronR size={12} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => void convert(i, 'later')}>To later</Button>
                      <span style={{ flex: 1 }} />
                      <IconBtn label="Delete" danger onClick={() => setDel({ t: 'inbox_items', id: i.id })}><IconTrash size={14} /></IconBtn>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {doneCount > 0 && <p className="micro faint" style={{ margin: 0 }}>{doneCount} converted — kept in history, never silently dropped.</p>}
      </div>

      <div className="stack">
        <div className="spread">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Later <span className="faint num">· {later.length}</span></h3>
          <Button variant="ghost" onClick={() => setLaterEdit({ title: '' })}><IconPlus size={15} />Park</Button>
        </div>
        <div className="strip small muted">Scope rule: before activating anything from Later, name which existing commitment gets reduced or paused.</div>
        {later.length === 0 ? (
          <div className="panel"><EmptyState icon={<IconInbox size={20} />} title="Later is empty" body="Park ideas here so they stop stealing focus." /></div>
        ) : (
          <div className="panel flush">
            <div className="rows">
              {later.map((l) => (
                <div key={l.id} className="trow" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <b>{l.title}</b>
                    <div className="small muted">Parked: {l.reason_deferred || '—'}</div>
                    {l.tradeoff ? <div className="small">Tradeoff to activate: {l.tradeoff}</div> : null}
                    <div className="row" style={{ marginTop: 8 }}>
                      <Button size="sm" variant="subtle" onClick={() => {
                        void api().create('tasks', { title: l.title, description: `Tradeoff: ${l.tradeoff}`, category: 'Personal', priority: 'P3', status: 'Inbox' }).then(() => {
                          void api().remove('later_items', l.id).then(() => void rL());
                          props.toast('Activated as a task.');
                        });
                      }}>Activate as task<IconChevronR size={12} /></Button>
                      <span style={{ flex: 1 }} />
                      <IconBtn label="Delete" danger onClick={() => setDel({ t: 'later_items', id: l.id })}><IconTrash size={14} /></IconBtn>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {edit && (
        <Modal title="Capture" sub="Get it out of your head in seconds" onClose={() => setEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => {
            if (!edit.title?.trim()) return;
            void api().create('inbox_items', { kind: edit.kind || 'idea', title: edit.title.trim(), detail: edit.detail || '' }).then(() => { setEdit(null); void rI(); props.toast('Captured.'); });
          }}>Capture</Button></>}>
          <div className="form-grid">
            <Field label="Kind"><select value={edit.kind || 'idea'} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}><option>task</option><option>idea</option><option>deadline</option><option>resource</option><option>reminder</option><option>project thought</option></select></Field>
            <Field label="Title"><input value={edit.title || ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} autoFocus placeholder="What is it?" /></Field>
            <Field label="Detail" full><textarea value={edit.detail || ''} onChange={(e) => setEdit({ ...edit, detail: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {laterEdit && (
        <Modal title="Park for later" sub="Protects today's focus" onClose={() => setLaterEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setLaterEdit(null)}>Cancel</Button><Button onClick={() => {
            if (!laterEdit.title?.trim()) return;
            void api().create('later_items', { title: laterEdit.title.trim(), reason_deferred: laterEdit.reason_deferred || '', tradeoff: laterEdit.tradeoff || '' }).then(() => { setLaterEdit(null); void rL(); });
          }}>Park it</Button></>}>
          <div className="form-grid">
            <Field label="Title" full><input value={laterEdit.title || ''} onChange={(e) => setLaterEdit({ ...laterEdit, title: e.target.value })} autoFocus /></Field>
            <Field label="Why deferred?" full><textarea value={laterEdit.reason_deferred || ''} onChange={(e) => setLaterEdit({ ...laterEdit, reason_deferred: e.target.value })} /></Field>
            <Field label="Tradeoff to activate" full><textarea value={laterEdit.tradeoff || ''} onChange={(e) => setLaterEdit({ ...laterEdit, tradeoff: e.target.value })} placeholder="What gets reduced or paused if this comes back?" /></Field>
          </div>
        </Modal>
      )}

      {del && <Confirm message="Delete this? Converted history is kept unless you delete it." onNo={() => setDel(null)} onYes={() => { void api().remove(del.t, del.id).then(() => { setDel(null); void rI(); void rL(); }); }} />}
    </div>
  );
}
