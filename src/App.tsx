import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api';
import { useToast, Modal, ErrorBoundary, Button, IconBtn } from './components/ui';
import {
  IconHome, IconPlanner, IconTasks, IconSchool, IconTimer, IconFlask, IconCode,
  IconTrophy, IconReview, IconChart, IconInbox, IconSettings, IconSearch,
  IconPlus, IconMenu, IconMoon, IconSun, IconCheck
} from './components/icons';
import type { Subject, SearchHit } from '../shared/types';
import HomePage from './pages/Home';
import PlannerPage from './pages/Planner';
import TasksPage from './pages/Tasks';
import SchoolPage from './pages/School';
import SessionsPage from './pages/Sessions';
import CapstonePage from './pages/Capstone';
import LearningPage from './pages/Learning';
import CompetitionsPage from './pages/Competitions';
import ReviewsPage from './pages/Reviews';
import InsightsPage from './pages/Insights';
import InboxPage from './pages/Inbox';
import SettingsPage from './pages/Settings';
import { APP_VERSION } from './lib/version';

const NAV: Array<{ id: string; label: string; icon: React.ReactNode; group?: string }> = [
  { id: 'home', label: 'Home', icon: <IconHome /> },
  { id: 'planner', label: 'Planner', icon: <IconPlanner /> },
  { id: 'tasks', label: 'Tasks', icon: <IconTasks /> },
  { id: 'school', label: 'School', icon: <IconSchool /> },
  { id: 'sessions', label: 'Study Sessions', icon: <IconTimer /> },
  { id: 'capstone', label: 'Capstone', icon: <IconFlask /> },
  { id: 'learning', label: 'Learning', icon: <IconCode /> },
  { id: 'competitions', label: 'Competitions', icon: <IconTrophy /> },
  { id: 'reviews', label: 'Weekly Reviews', icon: <IconReview /> },
  { id: 'insights', label: 'Insights', icon: <IconChart /> },
  { id: 'inbox', label: 'Inbox', icon: <IconInbox /> },
  { id: 'settings', label: 'Settings', icon: <IconSettings /> }
];

const META: Record<string, { title: string; sub: string }> = {
  home: { title: 'Home', sub: 'What should I do next?' },
  planner: { title: 'Planner', sub: 'School first · rest protected · no midnight pile-ups' },
  tasks: { title: 'Tasks', sub: 'Capture, plan, complete — everything persisted' },
  school: { title: 'School', sub: 'Subjects · red / yellow / green backlog · assessments' },
  sessions: { title: 'Study Sessions', sub: 'Timer with evidence-based reflection' },
  capstone: { title: 'Capstone — Bio brown', sub: 'Team 19215 · Smart Sustainable Food Packaging' },
  learning: { title: 'Learning', sub: 'CS50 · English · skills roadmap' },
  competitions: { title: 'Competitions', sub: 'Commit only with a capacity tradeoff' },
  reviews: { title: 'Weekly Reviews', sub: 'Guided reflection from real data' },
  insights: { title: 'Insights', sub: 'Real metrics only — no fake scores' },
  inbox: { title: 'Inbox', sub: 'Capture fast · convert, never discard' },
  settings: { title: 'Settings', sub: 'Theme · schedule · data safety · shortcuts' }
};

export default function App() {
  const [page, setPage] = useState('home');
  const [rail, setRail] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [openTasks, setOpenTasks] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selHit, setSelHit] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const [qaTitle, setQaTitle] = useState('');
  const [qaKind, setQaKind] = useState('task');
  const [nextDeadline, setNextDeadline] = useState('');
  const { toast, node } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const refreshSubjects = useCallback(async () => {
    try {
      const rows = await api().list('subjects', 'id ASC', 100);
      setSubjects(rows as Subject[]);
    } catch { /* offline-safe */ }
  }, []);

  const refreshCounts = useCallback(async () => {
    try {
      const tasks: any[] = await api().list('tasks', 'id DESC', 1000);
      setOpenTasks(tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled').length);
      const open = tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled' && t.due_at);
      open.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
      setNextDeadline(open[0] ? `${open[0].title} · ${new Date(open[0].due_at).toLocaleDateString()}` : 'no dated deadlines');
      const inbox: any[] = await api().list('inbox_items', 'id DESC', 200);
      setInboxCount(inbox.filter((i) => !i.converted).length);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void refreshSubjects();
    void refreshCounts();
    void api().settingGet('theme').then((v) => { if (v) setTheme(v); });
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e?.reason instanceof Error ? e.reason.message : '';
      if (msg && !/cancelled/i.test(msg)) toast(msg, true);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [refreshSubjects, refreshCounts]);

  // Opt-in deadline reminders: due within 24h or newly overdue, once per task.
  useEffect(() => {
    const seen = new Set<string>();
    async function check() {
      try {
        if ((await api().settingGet('notifications')) !== 'on') return;
        const tasks: any[] = await api().list('tasks', 'due_at ASC', 200);
        const now = Date.now();
        for (const t of tasks) {
          if (!t.due_at || t.status === 'Completed' || t.status === 'Cancelled') continue;
          const ms = new Date(t.due_at).getTime() - now;
          const key = `${t.id}:${t.due_at}`;
          if (ms < 24 * 3600 * 1000 && !seen.has(key)) {
            seen.add(key);
            const when = new Date(t.due_at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
            try {
              new Notification(ms < 0 ? 'Overdue — Life OS' : 'Due within 24h — Life OS', { body: `${t.title} · ${ms < 0 ? 'was due ' : 'due '}${when}` });
            } catch { /* notifications unavailable */ }
          }
        }
        if (seen.size > 500) seen.clear();
      } catch { /* ignore */ }
    }
    const kickoff = setTimeout(() => void check(), 25000);
    const timer = setInterval(() => void check(), 15 * 60 * 1000);
    return () => { clearTimeout(kickoff); clearInterval(timer); };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    void refreshCounts();
  }, [page, refreshCounts]);

  useEffect(() => {
    if (!query.trim()) { setHits([]); setSelHit(0); return; }
    const t = setTimeout(() => {
      void api().search(query.trim()).then((h) => { setHits(h); setSelHit(0); });
    }, 160);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 30);
    else setQuery('');
  }, [showSearch]);

  const openQuickAdd = useCallback(() => { setQaTitle(''); setQaKind('task'); setQuickAdd(true); }, []);

  useEffect(() => {
    let g = false;
    const timer = { id: 0 as unknown as ReturnType<typeof setTimeout> };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowSearch((s) => !s); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openQuickAdd(); return; }
      if (showSearch && e.key === 'ArrowDown' && hits.length > 0) { e.preventDefault(); setSelHit((s) => (s + 1) % hits.length); return; }
      if (showSearch && e.key === 'ArrowUp' && hits.length > 0) { e.preventDefault(); setSelHit((s) => (s - 1 + hits.length) % hits.length); return; }
      if (showSearch && e.key === 'Enter' && hits.length > 0) { e.preventDefault(); jumpTo(hits[selHit]); return; }
      if (typing) { if (e.key === 'Escape') (e.target as HTMLElement).blur(); return; }
      if (e.key === 'q' || e.key === 'Q') { openQuickAdd(); return; }
      if (e.key === '?') { setPage('settings'); return; }
      if (e.key === 'g' || e.key === 'G') { g = true; clearTimeout(timer.id); timer.id = setTimeout(() => { g = false; }, 700); return; }
      if (g && (e.key === 'h' || e.key === 'H')) { setPage('home'); g = false; return; }
      if (g && (e.key === 't' || e.key === 'T')) { setPage('tasks'); g = false; return; }
      if (e.key === 'Escape') { setQuickAdd(false); setShowSearch(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickAdd, showSearch, hits, selHit]);

  function jumpTo(h: SearchHit): void {
    setShowSearch(false);
    const map: Record<string, string> = {
      Task: 'tasks', Subject: 'school', Backlog: 'school', Milestone: 'capstone',
      Source: 'capstone', Competition: 'competitions', Inbox: 'inbox', Experiment: 'capstone',
      Lesson: 'learning', Skill: 'learning'
    };
    setPage(map[h.kind] || 'home');
  }

  async function submitQuickAdd() {
    if (!qaTitle.trim()) { toast('Title is required.', true); return; }
    if (qaKind === 'task') await api().create('tasks', { title: qaTitle.trim(), category: 'Personal', priority: 'P2', status: 'Inbox' });
    else if (qaKind === 'deadline') await api().create('tasks', { title: qaTitle.trim(), category: 'School', priority: 'P1', status: 'Planned', due_at: new Date(Date.now() + 864e5).toISOString() });
    else if (qaKind === 'note') await api().create('inbox_items', { kind: 'idea', title: qaTitle.trim(), detail: '' });
    else await api().create('study_sessions', { topic: qaTitle.trim(), objective: qaTitle.trim(), planned_minutes: 45, status: 'planned' });
    setQuickAdd(false);
    void refreshCounts();
    toast('Captured — find it in Tasks or Inbox.');
  }

  const meta = META[page] || META.home;
  const badge = (id: string) => (id === 'tasks' && openTasks > 0 ? openTasks : id === 'inbox' && inboxCount > 0 ? inboxCount : null);

  const content = useMemo(() => {
    if (page === 'home') return <HomePage toast={toast} subjects={subjects} go={setPage} openQuickAdd={openQuickAdd} />;
    if (page === 'planner') return <PlannerPage toast={toast} />;
    if (page === 'tasks') return <TasksPage toast={toast} subjects={subjects} />;
    if (page === 'school') return <SchoolPage toast={toast} subjects={subjects} refreshSubjects={refreshSubjects} />;
    if (page === 'sessions') return <SessionsPage toast={toast} subjects={subjects} />;
    if (page === 'capstone') return <CapstonePage toast={toast} />;
    if (page === 'learning') return <LearningPage toast={toast} />;
    if (page === 'competitions') return <CompetitionsPage toast={toast} />;
    if (page === 'reviews') return <ReviewsPage toast={toast} />;
    if (page === 'insights') return <InsightsPage subjects={subjects} />;
    if (page === 'inbox') return <InboxPage toast={toast} subjects={subjects} />;
    return <SettingsPage toast={toast} theme={theme} setTheme={(t) => { setTheme(t); void api().settingSet('theme', t); }} />;
  }, [page, toast, subjects, refreshSubjects, openQuickAdd, theme]);

  const grouped = useMemo(() => {
    const kinds = ['Task', 'Subject', 'Backlog', 'Milestone', 'Experiment', 'Lesson', 'Skill', 'Source', 'Competition', 'Inbox'];
    return kinds.map((k) => ({ kind: k, items: hits.map((h, i) => ({ h, i })).filter((x) => x.h.kind === k) })).filter((g) => g.items.length > 0);
  }, [hits]);

  return (
    <div className="shell">
      <aside className={`sidebar ${rail ? 'rail' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark">L</div>
          <div className="brand-text"><h1>Life OS</h1><small>G11 · STEM Gharbiya</small></div>
        </div>
        <nav className="nav">
          {NAV.slice(0, 5).map((n) => (
            <NavBtn key={n.id} n={n} active={page === n.id} badge={badge(n.id)} go={() => setPage(n.id)} />
          ))}
          <div className="nav-group"><span className="nav-label">Work</span></div>
          {NAV.slice(5, 8).map((n) => (
            <NavBtn key={n.id} n={n} active={page === n.id} badge={badge(n.id)} go={() => setPage(n.id)} />
          ))}
          <div className="nav-group"><span className="nav-label">Review</span></div>
          {NAV.slice(8).map((n) => (
            <NavBtn key={n.id} n={n} active={page === n.id} badge={badge(n.id)} go={() => setPage(n.id)} />
          ))}
        </nav>
        <div className="side-foot"><span className="pulse" /><span className="side-foot">v{APP_VERSION} · local</span></div>
      </aside>

      <div className="main">
        <div className="topbar">
          <IconBtn label={rail ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setRail((r) => !r)}><IconMenu size={17} /></IconBtn>
          <div style={{ minWidth: 0 }}>
            <h2>{meta.title}</h2>
            <div className="sub">{meta.sub}</div>
          </div>
          <span style={{ flex: 1 }} />
          <div className="search-input">
            <IconSearch size={15} />
            <input placeholder="Search records…" value={query} onChange={(e) => { setQuery(e.target.value); setShowSearch(true); }} onFocus={() => setShowSearch(true)} aria-label="Global search" />
            <kbd>Ctrl K</kbd>
          </div>
          <Button variant="ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
            {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
          </Button>
          <Button onClick={openQuickAdd} title="Quick add (Q)"><IconPlus size={15} />Quick add</Button>
        </div>

        <div className="content"><div className="content-inner" key={page}>
          <ErrorBoundary key={page} page={page}>{content}</ErrorBoundary>
        </div></div>

        <div className="statusbar">
          <span>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Next: {nextDeadline}</span>
          <span className="sep" />
          <span>saved locally · {subjects.length} subjects</span>
        </div>
      </div>

      {showSearch && (
        <>
          <div className="scrim" onMouseDown={() => setShowSearch(false)} />
          <div className="sheet palette modal" role="dialog" aria-label="Search">
            <div className="search-input" style={{ maxWidth: 'none' }}>
              <IconSearch size={16} />
              <input ref={searchRef} className="big" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setShowSearch(false); }} placeholder="Tasks, subjects, backlog, milestones, sources…" />
            </div>
            {hits.length === 0 ? (
              <div className="micro faint" style={{ padding: '14px 12px 8px' }}>{query.trim() ? 'No matches in saved records.' : 'Type to search everything. ↑↓ to move, Enter to open.'}</div>
            ) : grouped.map((g) => (
              <div key={g.kind}>
                <div className="p-group">{g.kind}s</div>
                {g.items.map(({ h, i }) => (
                  <div key={`${h.kind}-${h.id}`} className={`p-item ${i === selHit ? 'sel' : ''}`} onMouseDown={(e) => { e.preventDefault(); jumpTo(h); }} onMouseEnter={() => setSelHit(i)}>
                    <span className="pill p-kind">{h.kind}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</span>
                    <span className="micro faint">{h.subtitle}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {quickAdd && (
        <Modal
          title="Quick add" sub="Fast capture — triage later in Tasks or Inbox"
          onClose={() => setQuickAdd(false)}
          footer={<><Button variant="ghost" onClick={() => setQuickAdd(false)}>Cancel</Button><Button onClick={() => void submitQuickAdd()}><IconCheck size={14} />Add</Button></>}
        >
          <div className="form-grid">
            <label className="field">Type
              <select value={qaKind} onChange={(e) => setQaKind(e.target.value)}>
                <option value="task">task</option><option value="deadline">deadline (tomorrow)</option>
                <option value="note">note / idea</option><option value="session">study session</option>
              </select>
            </label>
            <label className="field">Title
              <input value={qaTitle} onChange={(e) => setQaTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submitQuickAdd(); }} autoFocus placeholder="What needs capturing?" />
            </label>
          </div>
        </Modal>
      )}
      {node}
    </div>
  );
}

function NavBtn(props: { n: { id: string; label: string; icon: React.ReactNode }; active: boolean; badge: number | null; go: () => void }) {
  return (
    <button className={`nav-item ${props.active ? 'active' : ''}`} onClick={props.go} title={props.n.label} aria-current={props.active ? 'page' : undefined}>
      {props.n.icon}<span className="nav-label">{props.n.label}</span>
      {props.badge !== null && <span className="nav-count">{props.badge}</span>}
    </button>
  );
}
