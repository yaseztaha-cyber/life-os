import React, { useMemo } from 'react';
import { useTable } from '../lib/hooks';
import { EmptyState, Stat, Bar } from '../components/ui';
import { IconChart } from '../components/icons';
import { completionRate } from '../../shared/logic';
import type { Task, StudySession, BacklogItem, Milestone, EnglishPractice, Subject } from '../../shared/types';

export default function InsightsPage(props: { subjects: Subject[] }) {
  void props.subjects;
  const { rows: tasks } = useTable<Task>('tasks', 'id DESC');
  const { rows: sessions } = useTable<StudySession>('study_sessions', 'id DESC');
  const { rows: backlog } = useTable<BacklogItem>('backlog_items', 'id DESC');
  const { rows: milestones } = useTable<Milestone>('milestones', 'position ASC');
  const { rows: eng } = useTable<EnglishPractice>('english_practice', 'practiced_at DESC');

  const weekAgo = Date.now() - 7 * 864e5;
  const recent = tasks.filter((t) => t.created_at && new Date(t.created_at).getTime() > weekAgo);
  const doneRecent = recent.filter((t) => t.status === 'Completed');
  const rate = completionRate(doneRecent.length, recent.length);
  const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now() && t.status !== 'Completed' && t.status !== 'Cancelled');
  const sessWeek = sessions.filter((s) => s.started_at && new Date(s.started_at).getTime() > weekAgo && s.status === 'completed');
  const minsWeek = sessWeek.reduce((s, x) => s + (x.actual_minutes ?? x.planned_minutes), 0);
  const engWeek = eng.filter((e) => new Date(e.practiced_at).getTime() > weekAgo);
  const engMin = engWeek.reduce((s, e) => s + (e.minutes || 0), 0);
  const totalSessions = sessions.filter((s) => s.status === 'completed').length;
  const minsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessWeek) {
      const k = (s.started_at || '').slice(0, 10);
      map.set(k, (map.get(k) || 0) + (s.actual_minutes ?? s.planned_minutes));
    }
    return [...map.entries()].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessWeek.length, tasks.length]);

  const enough = totalSessions >= 4;

  return (
    <div className="stack">
      <div className="grid cols-3">
        <div className="panel">
          <div className="panel-head"><h3>Completion · 7 days</h3></div>
          {recent.length === 0 ? (
            <p className="small faint" style={{ margin: 0 }}>No tasks created this week — complete a week first. No fabricated scores.</p>
          ) : (
            <>
              <div className="spread" style={{ marginBottom: 8 }}>
                <Stat value={rate !== null ? `${rate}%` : '—'} label={`${doneRecent.length}/${recent.length} completed`} />
              </div>
              <Bar pct={rate || 0} good={(rate || 0) >= 70} />
              <p className="micro faint num" style={{ margin: '8px 0 0' }}>{overdue.length} overdue right now</p>
            </>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Focus time · 7 days</h3></div>
          {sessWeek.length === 0 ? <p className="small faint" style={{ margin: 0 }}>No completed sessions this week.</p> : (
            <>
              <div className="spread" style={{ marginBottom: 8 }}>
                <Stat value={`${minsWeek}`} label={`min · ${sessWeek.length} sessions`} />
              </div>
              {minsByDay.map(([d, m]) => (
                <div key={d} className="spread small" style={{ padding: '3px 0' }}>
                  <span className="micro faint num" style={{ width: 76 }}>{d.slice(5)}</span>
                  <div className="bar grow"><div style={{ width: `${Math.min(100, (m / 120) * 100)}%` }} /></div>
                  <span className="num">{m}m</span>
                </div>
              ))}
            </>
          )}
          {!enough && <p className="micro faint" style={{ margin: '8px 0 0' }}>Trends need ≥4 completed sessions (now {totalSessions}).</p>}
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Backlog movement</h3></div>
          <div className="row wrap" style={{ marginBottom: 8 }}>
            <span className="pill p-red">{backlog.filter((b) => b.status === 'red').length} red</span>
            <span className="pill p-yellow">{backlog.filter((b) => b.status === 'yellow').length} yellow</span>
            <span className="pill p-green">{backlog.filter((b) => b.status === 'green').length} green</span>
          </div>
          <p className="micro faint" style={{ margin: '0 0 10px' }}>Status changes only with evidence in School. Tasks never auto-mark green.</p>
          <hr className="divider" />
          <div className="small" style={{ padding: '2px 0' }}>Capstone · <b className="num">{milestones.filter((m) => m.status === 'done').length}/{milestones.length}</b> milestones</div>
          <div className="small" style={{ padding: '2px 0' }}>English · <b className="num">{engMin} min</b> across {engWeek.length} logs</div>
        </div>
      </div>

      {tasks.length === 0 && sessions.length === 0 && (
        <div className="panel"><EmptyState icon={<IconChart size={20} />} title="Insights grow with your data" body="Complete tasks and log study sessions — trends appear after about a week of real records." /></div>
      )}
      <p className="micro faint" style={{ margin: 0 }}>Estimated or incomplete metrics are labeled as such. No gamified scores, no streaks-as-identity.</p>
    </div>
  );
}
