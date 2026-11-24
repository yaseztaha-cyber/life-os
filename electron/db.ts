import * as fs from 'fs';
import * as path from 'path';
import { ALLOW_TABLES, TableName } from '../shared/types';
import {
  UserError, assertValidId, clampLimit, sanitizeOrderBy,
  asText, asInt, asFloat, asEnum, asBoolInt, asIsoDate, asJsonText, asFkId
} from '../shared/validate';

// Lazy require so unit tests (vitest) that import shared/ code never load native module.
let Database: any = null;
function getDbLib(): any {
  if (!Database) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Database = require('better-sqlite3');
  }
  return Database;
}

export interface DbHandle {
  db: any;
  filePath: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#7c8aff',
  archived INTEGER DEFAULT 0,
  current_unit TEXT DEFAULT '',
  current_topic TEXT DEFAULT '',
  understanding INTEGER DEFAULT 3,
  next_action TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'School',
  subject_id INTEGER NULL REFERENCES subjects(id) ON DELETE SET NULL,
  priority TEXT DEFAULT 'P2',
  status TEXT DEFAULT 'Inbox',
  due_at TEXT NULL,
  estimated_minutes INTEGER NULL,
  actual_minutes INTEGER NULL,
  scheduled_at TEXT NULL,
  recurrence TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT NULL,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS backlog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NULL REFERENCES subjects(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  difficulty_desc TEXT DEFAULT '',
  prerequisite TEXT DEFAULT '',
  status TEXT DEFAULT 'red',
  priority TEXT DEFAULT 'P2',
  deadline TEXT NULL,
  estimated_minutes INTEGER NULL,
  last_attempted TEXT NULL,
  next_review TEXT NULL,
  notes TEXT DEFAULT '',
  evidence TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NULL REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT DEFAULT 'quiz',
  date_at TEXT NULL,
  confidence INTEGER DEFAULT 3,
  checklist TEXT DEFAULT '[]',
  notes TEXT DEFAULT '',
  done INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NULL REFERENCES subjects(id) ON DELETE SET NULL,
  topic TEXT DEFAULT '',
  objective TEXT DEFAULT '',
  planned_minutes INTEGER DEFAULT 45,
  actual_minutes INTEGER NULL,
  session_type TEXT DEFAULT 'focus',
  task_id INTEGER NULL REFERENCES tasks(id) ON DELETE SET NULL,
  difficulty TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  started_at TEXT NULL,
  ended_at TEXT NULL,
  status TEXT DEFAULT 'planned',
  reflection TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  phase TEXT DEFAULT '',
  description TEXT DEFAULT '',
  due_at TEXT NULL,
  status TEXT DEFAULT 'todo',
  position INTEGER DEFAULT 0,
  owner TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  research_question TEXT DEFAULT '',
  hypothesis TEXT DEFAULT '',
  iv TEXT DEFAULT '',
  dv TEXT DEFAULT '',
  controlled_vars TEXT DEFAULT '',
  control_group TEXT DEFAULT '',
  materials TEXT DEFAULT '',
  procedure TEXT DEFAULT '',
  replicates TEXT DEFAULT '',
  observations TEXT DEFAULT '',
  results TEXT DEFAULT '',
  limitations TEXT DEFAULT '',
  next_steps TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT DEFAULT '',
  pub_date TEXT DEFAULT '',
  url TEXT DEFAULT '',
  source_type TEXT DEFAULT 'paper',
  claim TEXT DEFAULT '',
  evidence TEXT DEFAULT '',
  limitations TEXT DEFAULT '',
  accessed_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit TEXT DEFAULT 'pcs',
  unit_price_egp REAL DEFAULT 0,
  supplier TEXT DEFAULT '',
  purchase_status TEXT DEFAULT 'needed',
  intended_use TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS capstone_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT DEFAULT 'next',
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  resolved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS learning_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track TEXT DEFAULT 'cs50',
  title TEXT NOT NULL,
  module TEXT DEFAULT '',
  status TEXT DEFAULT 'not-started',
  detail TEXT DEFAULT '',
  next_action TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS english_practice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill TEXT DEFAULT 'reading',
  minutes INTEGER DEFAULT 15,
  note TEXT DEFAULT '',
  practiced_at TEXT DEFAULT (datetime('now')),
  what_learned TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  reason TEXT DEFAULT '',
  level TEXT DEFAULT 'beginner',
  target TEXT DEFAULT '',
  prereqs TEXT DEFAULT '',
  resources TEXT DEFAULT '',
  evidence TEXT DEFAULT '',
  next_action TEXT DEFAULT '',
  priority TEXT DEFAULT 'P3',
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  organizer TEXT DEFAULT '',
  url TEXT DEFAULT '',
  eligibility TEXT DEFAULT '',
  deadline TEXT NULL,
  cost TEXT DEFAULT '',
  deliverables TEXT DEFAULT '',
  est_hours INTEGER NULL,
  status TEXT DEFAULT 'Discovering',
  next_action TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS inbox_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT DEFAULT 'idea',
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  converted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS later_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  reason_deferred TEXT DEFAULT '',
  tradeoff TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  completed_summary TEXT DEFAULT '',
  difficult_topics TEXT DEFAULT '',
  deadlines TEXT DEFAULT '',
  capstone_evidence TEXT DEFAULT '',
  cs50_count INTEGER DEFAULT 0,
  english_count INTEGER DEFAULT 0,
  distraction TEXT DEFAULT '',
  realistic TEXT DEFAULT '',
  sleep TEXT DEFAULT '',
  stop TEXT DEFAULT '',
  cont TEXT DEFAULT '',
  start TEXT DEFAULT '',
  next_outcomes TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS daily_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  must_task_id INTEGER NULL,
  secondary_task_id INTEGER NULL,
  optional_task_id INTEGER NULL,
  note TEXT DEFAULT '',
  shutdown TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sleep_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  bedtime TEXT DEFAULT '',
  wake TEXT DEFAULT '',
  hours REAL NULL,
  energy INTEGER DEFAULT 3,
  note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);
`;

const SUBJECT_SEED = [
  'Mechanics', 'Computer Science', 'Arabic', 'English', 'Mathematics',
  'Biology', 'Chemistry', 'Physics', 'Geology', 'German', 'Other subjects'
];

const CAPSTONE_PHASES = [
  'Challenge and rubric analysis',
  'Research',
  'Requirements and success criteria',
  'Design alternatives',
  'Prototype development',
  'Controlled experiments',
  'Natural-pigment indicator and reference scale',
  'Data analysis',
  'Design improvement',
  'Documentation and presentation'
];

export function openDatabase(filePath: string): DbHandle {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    return tryOpen(filePath);
  } catch (e: any) {
    // Quarantine a corrupt/unreadable database instead of crashing or
    // running with no storage. A fresh seeded DB is created; the broken
    // file is preserved for forensics and the UI is notified via setting.
    const msg = String(e?.message || e);
    if (!fs.existsSync(filePath)) throw e;
    const quarantine = `${filePath}.corrupt-${Date.now()}.sqlite`;
    try {
      fs.renameSync(filePath, quarantine);
    } catch {
      throw e; // e.g. permissions — do not mask the real error
    }
    for (const suffix of ['-wal', '-shm', '-journal']) {
      try { fs.unlinkSync(filePath + suffix); } catch { /* ignore */ }
    }
    const fresh = tryOpen(filePath);
    try {
      fresh.db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      ).run('dbRecoveredFromCorrupt', quarantine);
    } catch { /* ignore */ }
    console.error(`Life OS: database was corrupt and was quarantined (${msg}). Fresh DB created.`);
    return fresh;
  }
}

function tryOpen(filePath: string): DbHandle {
  const Lib = getDbLib();
  const db = new Lib(filePath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
    seedIfEmpty(db);
  } catch (e) {
    // Release the file handle first — on Windows an open handle blocks the
    // quarantine rename with EBUSY and masks the recovery path.
    try { db.close(); } catch { /* ignore */ }
    throw e;
  }
  return { db, filePath };
}

/** Schema version. Bump when adding migration steps below. */
export const SCHEMA_VERSION = 1;

function getSchemaVersion(db: any): number {
  try {
    const row = db.prepare(
      "SELECT value FROM settings WHERE key = 'schema_version'"
    ).get() as any;
    const v = Number(row?.value);
    return Number.isInteger(v) && v >= 0 ? v : 0;
  } catch {
    return 0; // settings table does not exist yet on a fresh DB
  }
}

/** Versioned migrations wrapped in a transaction. Always back up before migrating. */
export function migrate(db: any): void {
  const from = getSchemaVersion(db);
  if (from >= SCHEMA_VERSION) {
    repairInterruptedSessions(db);
    return;
  }
  const run = db.transaction(() => {
    if (from < 1) {
      db.exec(SCHEMA);
    }
    // Future: if (from < 2) { ... }
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).run('schema_version', String(SCHEMA_VERSION));
  });
  run();
  repairInterruptedSessions(db);
}

/**
 * Sessions left 'running' by a quit/crash/restart must never silently accrue
 * hours. Park them as paused; the timer UI resumes from accumulated minutes
 * and the user explicitly presses Resume.
 */
export function repairInterruptedSessions(db: any): void {
  try {
    db.prepare(
      "UPDATE study_sessions SET status = 'paused' WHERE status = 'running'"
    ).run();
  } catch { /* table may not exist yet in exotic states */ }
}

function seedIfEmpty(db: any): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM subjects').get() as any).c as number;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO subjects (name, color) VALUES (?, ?)');
    const colors = ['#7c8aff', '#4cc9f0', '#80ed99', '#ffd166', '#ef476f', '#06d6a0', '#f78c6b', '#9b5de5', '#00bbf9', '#90be6d', '#adb5bd'];
    SUBJECT_SEED.forEach((name, i) => ins.run(name, colors[i % colors.length]));
  }
  const mcount = (db.prepare('SELECT COUNT(*) AS c FROM milestones').get() as any).c as number;
  if (mcount === 0) {
    const ins = db.prepare('INSERT INTO milestones (title, phase, status, position, owner) VALUES (?, ?, ?, ?, ?)');
    CAPSTONE_PHASES.forEach((phase, i) => ins.run(phase, phase, i === 0 ? 'doing' : 'todo', i, 'Team 19215'));
    db.prepare(
      "INSERT INTO capstone_entries (kind, title, detail) VALUES ('next', ?, ?)"
    ).run(
      'Bio brown — read challenge + rubric',
      'Project: Bio brown. Team 19215. G11 Semester 1, STEM Gharbiya. Challenge: Smart Sustainable Food Packaging. Theme: Change, Equilibrium, Cycles.'
    );
  }
  const defaults: Record<string, string> = {
    theme: 'dark',
    weekStart: 'sunday',
    schoolStart: '07:00',
    schoolEnd: '15:00',
    wakeTime: '06:00',
    bedTime: '22:30',
    defaultSessionMinutes: '45',
    notifications: 'off',
    capstoneName: 'Bio brown',
    capstoneTeam: '19215'
  };
  const get = db.prepare('SELECT value FROM settings WHERE key = ?');
  const put = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) put.run(k, v);
}

const COLUMNS: Record<TableName, string[]> = {
  subjects: ['name', 'color', 'archived', 'current_unit', 'current_topic', 'understanding', 'next_action', 'notes'],
  tasks: ['title', 'description', 'category', 'subject_id', 'priority', 'status', 'due_at', 'estimated_minutes', 'actual_minutes', 'scheduled_at', 'recurrence', 'tags', 'completed_at', 'notes'],
  subtasks: ['task_id', 'title', 'done', 'position'],
  backlog_items: ['subject_id', 'topic', 'difficulty_desc', 'prerequisite', 'status', 'priority', 'deadline', 'estimated_minutes', 'last_attempted', 'next_review', 'notes', 'evidence'],
  assessments: ['subject_id', 'title', 'kind', 'date_at', 'confidence', 'checklist', 'notes', 'done'],
  study_sessions: ['subject_id', 'topic', 'objective', 'planned_minutes', 'actual_minutes', 'session_type', 'task_id', 'difficulty', 'notes', 'started_at', 'ended_at', 'status', 'reflection'],
  milestones: ['title', 'phase', 'description', 'due_at', 'status', 'position', 'owner'],
  experiments: ['title', 'research_question', 'hypothesis', 'iv', 'dv', 'controlled_vars', 'control_group', 'materials', 'procedure', 'replicates', 'observations', 'results', 'limitations', 'next_steps'],
  sources: ['title', 'author', 'pub_date', 'url', 'source_type', 'claim', 'evidence', 'limitations', 'accessed_at'],
  materials: ['name', 'quantity', 'unit', 'unit_price_egp', 'supplier', 'purchase_status', 'intended_use'],
  capstone_entries: ['kind', 'title', 'detail', 'resolved'],
  learning_items: ['track', 'title', 'module', 'status', 'detail', 'next_action'],
  english_practice: ['skill', 'minutes', 'note', 'practiced_at', 'what_learned'],
  skills: ['name', 'reason', 'level', 'target', 'prereqs', 'resources', 'evidence', 'next_action', 'priority', 'active'],
  competitions: ['name', 'organizer', 'url', 'eligibility', 'deadline', 'cost', 'deliverables', 'est_hours', 'status', 'next_action', 'notes'],
  inbox_items: ['kind', 'title', 'detail', 'converted'],
  later_items: ['title', 'reason_deferred', 'tradeoff'],
  weekly_reviews: ['week_start', 'completed_summary', 'difficult_topics', 'deadlines', 'capstone_evidence', 'cs50_count', 'english_count', 'distraction', 'realistic', 'sleep', 'stop', 'cont', 'start', 'next_outcomes'],
  daily_plans: ['date', 'must_task_id', 'secondary_task_id', 'optional_task_id', 'note', 'shutdown'],
  sleep_checkins: ['date', 'bedtime', 'wake', 'hours', 'energy', 'note']
};

export function assertTable(table: string): asserts table is TableName {
  if (!(ALLOW_TABLES as string[]).includes(table)) throw new UserError('Unknown data table.');
}

// ---------------------------------------------------------------------------
// Row sanitization: every write path (IPC, restore) goes through here.
// Unknown columns are dropped (never interpolated into SQL), values are
// type/length/enum-checked, errors carry no SQL or file paths.
// ---------------------------------------------------------------------------

type ColFn = (v: unknown) => unknown;

const t200 = (f: string): ColFn => (v) => asText(v, 200, f);
const t60 = (f: string): ColFn => (v) => asText(v, 60, f);
const t120 = (f: string): ColFn => (v) => asText(v, 120, f);
const t1000 = (f: string): ColFn => (v) => asText(v, 1000, f);
const t2000 = (f: string): ColFn => (v) => asText(v, 2000, f);
const t5000 = (f: string): ColFn => (v) => asText(v, 5000, f);
const t20000 = (f: string): ColFn => (v) => asText(v, 20000, f);
const iso = (f: string): ColFn => (v) => asIsoDate(v, f);
const fk = (f: string): ColFn => (v) => asFkId(v, f);
const bool = (f: string, d: number): ColFn => (v) => asBoolInt(v, f, d);
const mins = (f: string): ColFn => (v) => asInt(v, 0, 1440, f);

const PRI = ['P1', 'P2', 'P3'] as const;
const TASK_STATUS = ['Inbox', 'Planned', 'In progress', 'Waiting', 'Completed', 'Cancelled'] as const;
const TASK_CAT = ['School', 'Homework', 'Backlog recovery', 'Assessment preparation', 'Capstone', 'CS50', 'English', 'Competitions', 'Personal', 'Other'] as const;
const COMP_STATUS = ['Discovering', 'Checking eligibility', 'Considering', 'Committed', 'Preparing', 'Submitted', 'Completed', 'Not pursuing'] as const;

const color: ColFn = (v) => {
  const s = asText(v, 20, 'Color');
  if (!s) return '#7c8aff';
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new UserError('Color must be a hex code like #7c8aff.');
  return s;
};

const reqDate: ColFn = (v) => {
  const s = asIsoDate(v, 'Date');
  if (!s) throw new Error('Date is required.');
  return s;
};

const FIELD_SPECS: Record<TableName, Record<string, ColFn>> = {
  subjects: {
    name: t200('Subject name'), color, archived: bool('Archived', 0),
    current_unit: t200('Current unit'), current_topic: t200('Current topic'),
    understanding: (v) => asInt(v, 1, 5, 'Understanding') ?? 3,
    next_action: (v) => asText(v, 500, 'Next action'), notes: t20000('Notes')
  },
  tasks: {
    title: t200('Title'), description: t20000('Description'),
    category: (v) => asEnum(v, TASK_CAT, 'Category', 'School'),
    subject_id: fk('Subject'), priority: (v) => asEnum(v, PRI, 'Priority', 'P2'),
    status: (v) => asEnum(v, TASK_STATUS, 'Status', 'Inbox'),
    due_at: iso('Due date'), estimated_minutes: mins('Estimated duration'),
    actual_minutes: mins('Actual duration'), scheduled_at: iso('Scheduled time'),
    recurrence: (v) => asEnum(v, ['', 'daily', 'weekly'] as const, 'Recurrence', ''),
    tags: (v) => asJsonText(v, 5000, 'Tags', '[]'),
    completed_at: iso('Completion date'), notes: t20000('Notes')
  },
  subtasks: {
    task_id: fk('Task'), title: t200('Title'), done: bool('Done', 0),
    position: (v) => asInt(v, 0, 100000, 'Position') ?? 0
  },
  backlog_items: {
    subject_id: fk('Subject'), topic: t200('Topic'),
    difficulty_desc: t20000('Difficulty'), prerequisite: t1000('Prerequisite'),
    status: (v) => asEnum(v, ['red', 'yellow', 'green'] as const, 'Status', 'red'),
    priority: (v) => asEnum(v, PRI, 'Priority', 'P2'),
    deadline: iso('Deadline'), estimated_minutes: mins('Estimated duration'),
    last_attempted: iso('Last attempted'), next_review: iso('Next review'),
    notes: t20000('Notes'), evidence: t20000('Evidence')
  },
  assessments: {
    subject_id: fk('Subject'), title: t200('Title'), kind: (v) => asText(v, 60, 'Type') || 'quiz',
    date_at: iso('Date'), confidence: (v) => asInt(v, 1, 5, 'Confidence') ?? 3,
    checklist: (v) => asJsonText(v, 5000, 'Checklist', '[]'),
    notes: t20000('Notes'), done: bool('Done', 0)
  },
  study_sessions: {
    subject_id: fk('Subject'), topic: t200('Topic'), objective: (v) => asText(v, 2000, 'Objective'),
    planned_minutes: (v) => asInt(v, 1, 480, 'Planned duration') ?? 45,
    actual_minutes: mins('Actual duration'),
    session_type: (v) => asText(v, 40, 'Session type') || 'focus',
    task_id: fk('Task'), difficulty: t60('Difficulty'), notes: t20000('Notes'),
    started_at: iso('Start time'), ended_at: iso('End time'),
    status: (v) => asEnum(v, ['planned', 'running', 'paused', 'completed', 'cancelled'] as const, 'Status', 'planned'),
    reflection: (v) => asJsonText(v, 20000, 'Reflection', '{}')
  },
  milestones: {
    title: t200('Title'), phase: t200('Phase'), description: t20000('Description'),
    due_at: iso('Due date'),
    status: (v) => asEnum(v, ['todo', 'doing', 'done'] as const, 'Status', 'todo'),
    position: (v) => asInt(v, 0, 100000, 'Position') ?? 0,
    owner: t120('Owner')
  },
  experiments: {
    title: t200('Title'), research_question: t20000('Research question'),
    hypothesis: t20000('Hypothesis'), iv: t20000('Independent variable'),
    dv: t20000('Dependent variable'), controlled_vars: t20000('Controlled variables'),
    control_group: t20000('Control group'), materials: t20000('Materials'),
    procedure: t20000('Procedure'), replicates: t20000('Replicates'),
    observations: t20000('Observations'), results: t20000('Results'),
    limitations: t20000('Limitations'), next_steps: t20000('Next steps')
  },
  sources: {
    title: t200('Title'), author: t200('Author'), pub_date: t60('Publication date'),
    url: (v) => asText(v, 2000, 'URL'),
    source_type: (v) => asText(v, 40, 'Source type') || 'paper',
    claim: t20000('Claim'), evidence: t20000('Evidence'),
    limitations: t20000('Limitations'), accessed_at: iso('Access date')
  },
  materials: {
    name: t200('Material name'),
    quantity: (v) => asFloat(v, 0, 1000000000, 'Quantity') ?? 1,
    unit: (v) => asText(v, 40, 'Unit') || 'pcs',
    unit_price_egp: (v) => asFloat(v, 0, 1000000000, 'Unit price') ?? 0,
    supplier: t200('Supplier'),
    purchase_status: (v) => asEnum(v, ['needed', 'ordered', 'purchased'] as const, 'Purchase status', 'needed'),
    intended_use: t2000('Intended use')
  },
  capstone_entries: {
    kind: (v) => asEnum(v, ['blocker', 'decision', 'next'] as const, 'Kind', 'next'),
    title: t200('Title'), detail: t20000('Detail'), resolved: bool('Resolved', 0)
  },
  learning_items: {
    track: (v) => asEnum(v, ['cs50', 'english', 'skill'] as const, 'Track', 'cs50'),
    title: t200('Title'), module: t120('Module'),
    status: (v) => asEnum(v, ['not-started', 'doing', 'done', 'deferred'] as const, 'Status', 'not-started'),
    detail: t20000('Detail'), next_action: t1000('Next action')
  },
  english_practice: {
    skill: (v) => asEnum(v, ['listening', 'reading', 'vocabulary', 'writing', 'speaking', 'academic'] as const, 'Skill', 'reading'),
    minutes: (v) => asInt(v, 1, 600, 'Minutes') ?? 15,
    note: t5000('Note'), practiced_at: iso('Practice date'), what_learned: t5000('What I learned')
  },
  skills: {
    name: t200('Skill name'), reason: t2000('Reason'), level: t60('Level'),
    target: t2000('Target'), prereqs: t2000('Prerequisites'), resources: t5000('Resources'),
    evidence: t5000('Evidence'), next_action: t1000('Next action'),
    priority: (v) => asEnum(v, PRI, 'Priority', 'P3'), active: bool('Active', 1)
  },
  competitions: {
    name: t200('Name'), organizer: t200('Organizer'), url: (v) => asText(v, 2000, 'URL'),
    eligibility: t5000('Eligibility'), deadline: iso('Deadline'), cost: t200('Cost'),
    deliverables: t5000('Deliverables'),
    est_hours: (v) => asInt(v, 0, 10000, 'Estimated hours'),
    status: (v) => asEnum(v, COMP_STATUS, 'Status', 'Discovering'),
    next_action: t1000('Next action'), notes: t20000('Notes')
  },
  inbox_items: {
    kind: (v) => asEnum(v, ['task', 'idea', 'deadline', 'resource', 'reminder', 'project thought'] as const, 'Kind', 'idea'),
    title: t200('Title'), detail: t20000('Detail'), converted: bool('Converted', 0)
  },
  later_items: {
    title: t200('Title'), reason_deferred: t2000('Reason'), tradeoff: t2000('Tradeoff')
  },
  weekly_reviews: {
    week_start: reqDate, completed_summary: t20000('Summary'),
    difficult_topics: t20000('Difficult topics'), deadlines: t5000('Deadlines'),
    capstone_evidence: t20000('Capstone evidence'),
    cs50_count: (v) => asInt(v, 0, 1000, 'CS50 count') ?? 0,
    english_count: (v) => asInt(v, 0, 1000, 'English count') ?? 0,
    distraction: t5000('Distraction'), realistic: t1000('Realistic'),
    sleep: t1000('Sleep'), stop: t2000('Stop'), cont: t2000('Continue'), start: t2000('Start'),
    next_outcomes: (v) => asJsonText(v, 10000, 'Next outcomes', '[]')
  },
  daily_plans: {
    date: reqDate, must_task_id: fk('Must task'),
    secondary_task_id: fk('Secondary task'), optional_task_id: fk('Optional task'),
    note: t5000('Note'), shutdown: (v) => asJsonText(v, 10000, 'Shutdown', '{}')
  },
  sleep_checkins: {
    date: reqDate, bedtime: (v) => asText(v, 20, 'Bedtime'), wake: (v) => asText(v, 20, 'Wake time'),
    hours: (v) => asFloat(v, 0, 24, 'Hours'),
    energy: (v) => asInt(v, 1, 5, 'Energy') ?? 3, note: t2000('Note')
  }
};

/** Columns that must be non-empty when creating a record. */
const REQUIRED: Record<TableName, string[]> = {
  subjects: ['name'],
  tasks: ['title'],
  subtasks: ['task_id', 'title'],
  backlog_items: ['topic'],
  assessments: ['title'],
  study_sessions: ['objective'],
  milestones: ['title'],
  experiments: ['title'],
  sources: ['title'],
  materials: ['name'],
  capstone_entries: ['title'],
  learning_items: ['title'],
  english_practice: [],
  skills: ['name'],
  competitions: ['name'],
  inbox_items: ['title'],
  later_items: ['title'],
  weekly_reviews: ['week_start'],
  daily_plans: ['date'],
  sleep_checkins: ['date']
};

export function sanitizeRow(table: TableName, data: Record<string, unknown>, forUpdate: boolean): Record<string, unknown> {
  assertTable(table);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new UserError('Invalid record data.');
  }
  const spec = FIELD_SPECS[table];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const fn = spec[k];
    if (!fn) continue; // drop unknown columns — they never reach SQL
    out[k] = fn(v);
  }
  if (!forUpdate) {
    for (const req of REQUIRED[table]) {
      const val = out[req];
      if (val === null || val === undefined || val === '') {
        throw new UserError('A required field is missing.');
      }
    }
  }
  return out;
}

export function listRows(db: any, table: TableName, orderBy = 'id DESC', limit = 500): any[] {
  assertTable(table);
  const safeOrder = sanitizeOrderBy(orderBy, [...COLUMNS[table], 'id', 'created_at']);
  const safeLimit = clampLimit(limit);
  const stmt = db.prepare(`SELECT * FROM ${table} ORDER BY ${safeOrder} LIMIT ?`);
  return stmt.all(safeLimit);
}

export function getRow(db: any, table: TableName, id: number): any {
  assertTable(table);
  const safeId = assertValidId(id);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(safeId);
}

export function createRow(db: any, table: TableName, data: Record<string, unknown>): number {
  assertTable(table);
  const clean = sanitizeRow(table, data, false);
  const cols = Object.keys(clean);
  if (cols.length === 0) throw new UserError('Nothing valid to save.');
  const placeholders = cols.map(() => '?').join(', ');
  const vals = cols.map((c) => (clean[c] === undefined ? null : clean[c]));
  const info = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
  return Number(info.lastInsertRowid);
}

/** Insert a restore row preserving its original id (fresh tables, so no collision). */
export function insertRestoredRow(db: any, table: TableName, row: Record<string, unknown>): void {
  assertTable(table);
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new UserError('Bad restore row.');
  const { id, created_at, ...rest } = row as any;
  void created_at;
  const clean = sanitizeRow(table, rest, true);
  const cols: string[] = [];
  const vals: unknown[] = [];
  try {
    const safeId = assertValidId(id);
    cols.push('id');
    vals.push(safeId);
  } catch { /* fresh id assigned */ }
  for (const [k, v] of Object.entries(clean)) {
    cols.push(k);
    vals.push(v === undefined ? null : v);
  }
  if (cols.length === 0) throw new UserError('Bad restore row.');
  const placeholders = cols.map(() => '?').join(', ');
  db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
}

export function updateRow(db: any, table: TableName, id: number, data: Record<string, unknown>): void {
  assertTable(table);
  const safeId = assertValidId(id);
  const clean = sanitizeRow(table, data, true);
  const cols = Object.keys(clean);
  if (cols.length === 0) return;
  const set = cols.map((c) => `${c} = ?`).join(', ');
  const vals = cols.map((c) => (clean[c] === undefined ? null : clean[c]));
  db.prepare(`UPDATE ${table} SET ${set} WHERE id = ?`).run(...vals, safeId);
}

export function deleteRow(db: any, table: TableName, id: number): void {
  assertTable(table);
  const safeId = assertValidId(id);
  // Cascade subtasks manually for safety
  if (table === 'tasks') db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(safeId);
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(safeId);
}

export function searchAll(db: any, term: string): Array<{ kind: string; id: number; title: string; subtitle: string }> {
  const q = `%${term}%`;
  const out: Array<{ kind: string; id: number; title: string; subtitle: string }> = [];
  const push = (rows: any[], kind: string, titleKey: string, subKey: string) => {
    for (const r of rows) out.push({ kind, id: r.id, title: String(r[titleKey] ?? ''), subtitle: String(r[subKey] ?? '') });
  };
  push(db.prepare('SELECT id, title, category FROM tasks WHERE title LIKE ? OR description LIKE ? OR notes LIKE ? LIMIT 20').all(q, q, q), 'Task', 'title', 'category');
  push(db.prepare('SELECT id, name AS title, current_topic FROM subjects WHERE name LIKE ? OR current_topic LIKE ? OR notes LIKE ? LIMIT 20').all(q, q, q), 'Subject', 'title', 'current_topic');
  push(db.prepare('SELECT id, topic AS title, status FROM backlog_items WHERE topic LIKE ? OR difficulty_desc LIKE ? LIMIT 20').all(q, q), 'Backlog', 'title', 'status');
  push(db.prepare('SELECT id, title, phase FROM milestones WHERE title LIKE ? LIMIT 20').all(q), 'Milestone', 'title', 'phase');
  push(db.prepare('SELECT id, title, author FROM sources WHERE title LIKE ? OR author LIKE ? LIMIT 20').all(q, q), 'Source', 'title', 'author');
  push(db.prepare('SELECT id, name AS title, organizer FROM competitions WHERE name LIKE ? LIMIT 20').all(q), 'Competition', 'title', 'organizer');
  push(db.prepare('SELECT id, title, kind FROM inbox_items WHERE title LIKE ? OR detail LIKE ? LIMIT 20').all(q, q), 'Inbox', 'title', 'kind');
  push(db.prepare('SELECT id, title, research_question FROM experiments WHERE title LIKE ? OR research_question LIKE ? LIMIT 20').all(q, q), 'Experiment', 'title', 'research_question');
  push(db.prepare("SELECT id, title, module FROM learning_items WHERE title LIKE ? OR module LIKE ? LIMIT 20").all(q, q), 'Lesson', 'title', 'module');
  push(db.prepare('SELECT id, name AS title, level FROM skills WHERE name LIKE ? LIMIT 20').all(q), 'Skill', 'title', 'level');
  return out.slice(0, 60);
}

export function exportAll(db: any): Record<string, any[]> {
  const dump: Record<string, any[]> = {};
  for (const t of ALLOW_TABLES) dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  dump['settings'] = db.prepare('SELECT * FROM settings').all();
  return dump;
}
