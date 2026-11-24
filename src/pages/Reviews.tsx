import React, { useState } from 'react';
import { api } from '../lib/api';
import { useTable } from '../lib/hooks';
import { Modal, EmptyState, Confirm, Button, IconBtn, Field } from '../components/ui';
import { IconPlus, IconEdit, IconTrash, IconReview } from '../components/icons';
import type { WeeklyReview, Task, StudySession, Milestone, EnglishPractice, LearningItem } from '../../shared/types';

export default function ReviewsPage(props: { toast: (m: string, e?: boolean) => void }) {
  const { rows, refresh } = useTable<WeeklyReview>('weekly_reviews', 'week_start DESC');
  const { rows: tasks } = useTable<Task>('tasks', 'id DESC');
  const { rows: sessions } = useTable<StudySession>('study_sessions', 'id DESC');
  const { rows: milestones } = useTable<Milestone>('milestones', 'position ASC');
  const { rows: eng } = useTable<EnglishPractice>('english_practice', 'practiced_at DESC');
  const { rows: learning } = useTable<LearningItem>('learning_items', 'id DESC');
  const [edit, setEdit] = useState<(Partial<WeeklyReview> & { id?: number }) | null>(null);
  const [del, setDel] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function prefill(): Partial<WeeklyReview> {
    const weekAgo = Date.now() - 7 * 864e5;
    const done = tasks.filter((t) => t.status === 'Completed' && t.completed_at && new Date(t.completed_at).getTime() > weekAgo);
    const sess = sessions.filter((s) => s.started_at && new Date(s.started_at).getTime() > weekAgo && s.status === 'completed');
    const cs50 = learning.filter((l) => l.track === 'cs50' && l.status === 'done').length;
    const eCount = eng.filter((e) => new Date(e.practiced_at).getTime() > weekAgo).length;
    const ms = milestones.filter((m) => m.status === 'done').length;
    const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return {
      week_start: monday.toISOString().slice(0, 10),
      completed_summary: `${done.length} tasks completed${done.length ? `: ${done.slice(0, 5).map((t) => t.title).join('; ')}` : ''}`,
      capstone_evidence: `${ms} milestones done · ${sess.length} study sessions this week`,
      cs50_count: cs50, english_count: eCount,
      next_outcomes: JSON.stringify(['', '', ''])
    };
  }

  async function save() {
    if (!edit?.week_start) { setErr('Week start is required.'); return; }
    const p = { week_start: edit.week_start, completed_summary: edit.completed_summary || '', difficult_topics: edit.difficult_topics || '', deadlines: edit.deadlines || '', capstone_evidence: edit.capstone_evidence || '', cs50_count: edit.cs50_count || 0, english_count: edit.english_count || 0, distraction: edit.distraction || '', realistic: edit.realistic || '', sleep: edit.sleep || '', stop: edit.stop || '', cont: edit.cont || '', start: edit.start || '', next_outcomes: edit.next_outcomes || '[]' };
    if (edit.id) await api().update('weekly_reviews', edit.id, p); else await api().create('weekly_reviews', p);
    setEdit(null); setErr(null); await refresh(); props.toast('Weekly review saved.');
  }

  return (
    <div className="stack">
      <div className="spread">
        <p className="small faint" style={{ margin: 0, maxWidth: 600 }}>One honest hour a week beats ten distracted ones. Counts prefill from real records — the reflection is yours.</p>
        <Button onClick={() => { setErr(null); setEdit(prefill()); }}><IconPlus size={15} />New review</Button>
      </div>

      {rows.length === 0 ? (
        <div className="panel"><EmptyState icon={<IconReview size={20} />} title="No weekly reviews yet" body="Start your first guided review — stop / continue / start, plus next week's three outcomes." actionLabel="+ Start review" onAction={() => { setErr(null); setEdit(prefill()); }} /></div>
      ) : (
        <div className="grid cols-2">
          {rows.map((r) => (
            <div key={r.id} className="panel">
              <div className="spread" style={{ marginBottom: 6 }}>
                <h4 style={{ margin: 0 }}>Week of {r.week_start}</h4>
                <span className="row">
                  <IconBtn label="Edit" onClick={() => { setErr(null); setEdit({ ...r }); }}><IconEdit size={14} /></IconBtn>
                  <IconBtn label="Delete" danger onClick={() => setDel(r.id)}><IconTrash size={14} /></IconBtn>
                </span>
              </div>
              <div className="small"><span className="faint">Done: </span>{r.completed_summary || '—'}</div>
              <div className="small"><span className="faint">Difficult: </span>{r.difficult_topics || '—'}</div>
              <div className="small"><span className="faint">Stop / Continue / Start: </span>{[r.stop, r.cont, r.start].filter(Boolean).join(' / ') || '—'}</div>
              <div className="micro faint num" style={{ marginTop: 6 }}>CS50 {r.cs50_count} · English {r.english_count} · Sleep: {r.sleep || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <Modal title="Weekly review" sub="Prefilled from your week — now be honest" wide onClose={() => setEdit(null)}
          footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => void save()}>Save review</Button></>}>
          {err && <div className="strip bad small" style={{ marginBottom: 12 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Week start"><input type="date" value={edit.week_start || ''} onChange={(e) => setEdit({ ...edit, week_start: e.target.value })} /></Field>
            <Field label="Deadlines approaching"><textarea value={edit.deadlines || ''} onChange={(e) => setEdit({ ...edit, deadlines: e.target.value })} /></Field>
            <Field label="What did I complete?" full><textarea value={edit.completed_summary || ''} onChange={(e) => setEdit({ ...edit, completed_summary: e.target.value })} /></Field>
            <Field label="Which topics remain difficult?" full><textarea value={edit.difficult_topics || ''} onChange={(e) => setEdit({ ...edit, difficult_topics: e.target.value })} /></Field>
            <Field label="Capstone evidence produced" full><textarea value={edit.capstone_evidence || ''} onChange={(e) => setEdit({ ...edit, capstone_evidence: e.target.value })} /></Field>
            <Field label="CS50 sessions"><input type="number" min={0} value={edit.cs50_count ?? 0} onChange={(e) => setEdit({ ...edit, cs50_count: Number(e.target.value) })} /></Field>
            <Field label="English sessions"><input type="number" min={0} value={edit.english_count ?? 0} onChange={(e) => setEdit({ ...edit, english_count: Number(e.target.value) })} /></Field>
            <Field label="Biggest distraction" full><textarea value={edit.distraction || ''} onChange={(e) => setEdit({ ...edit, distraction: e.target.value })} /></Field>
            <Field label="Was the schedule realistic?"><input value={edit.realistic || ''} onChange={(e) => setEdit({ ...edit, realistic: e.target.value })} /></Field>
            <Field label="Sleep adequate?"><input value={edit.sleep || ''} onChange={(e) => setEdit({ ...edit, sleep: e.target.value })} /></Field>
            <Field label="Stop"><input value={edit.stop || ''} onChange={(e) => setEdit({ ...edit, stop: e.target.value })} /></Field>
            <Field label="Continue"><input value={edit.cont || ''} onChange={(e) => setEdit({ ...edit, cont: e.target.value })} /></Field>
            <Field label="Start"><input value={edit.start || ''} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></Field>
            <Field label="Next week's 3 outcomes (one per line)" full><textarea value={(() => { try { return (JSON.parse(edit.next_outcomes || '[]') as string[]).join('\n'); } catch { return ''; } })()} onChange={(e) => setEdit({ ...edit, next_outcomes: JSON.stringify(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)) })} /></Field>
          </div>
        </Modal>
      )}
      {del !== null && <Confirm message="Delete this review?" onNo={() => setDel(null)} onYes={() => { void api().remove('weekly_reviews', del).then(() => { setDel(null); void refresh(); }); }} />}
    </div>
  );
}
