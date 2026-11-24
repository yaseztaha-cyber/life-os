// Shared TypeScript types — used by main + renderer. Keep in sync with electron/db.ts schema.

export type ID = number;

export interface Subject {
  id: ID;
  name: string;
  color: string;
  archived: number; // 0/1
  current_unit: string;
  current_topic: string;
  understanding: number; // 1-5
  next_action: string;
  notes: string;
  created_at: string;
}

export type TaskCategory =
  | 'School' | 'Homework' | 'Backlog recovery' | 'Assessment preparation'
  | 'Capstone' | 'CS50' | 'English' | 'Competitions' | 'Personal' | 'Other';

export type TaskStatus = 'Inbox' | 'Planned' | 'In progress' | 'Waiting' | 'Completed' | 'Cancelled';
export type Priority = 'P1' | 'P2' | 'P3';

export interface Task {
  id: ID;
  title: string;
  description: string;
  category: TaskCategory;
  subject_id: number | null;
  priority: Priority;
  status: TaskStatus;
  due_at: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  scheduled_at: string | null;
  recurrence: string; // '', 'daily','weekly'
  tags: string; // JSON array string
  created_at: string;
  completed_at: string | null;
  notes: string;
}

export interface Subtask {
  id: ID;
  task_id: ID;
  title: string;
  done: number;
  position: number;
}

export type BacklogStatus = 'red' | 'yellow' | 'green';

export interface BacklogItem {
  id: ID;
  subject_id: number | null;
  topic: string;
  difficulty_desc: string;
  prerequisite: string;
  status: BacklogStatus;
  priority: Priority;
  deadline: string | null;
  estimated_minutes: number | null;
  last_attempted: string | null;
  next_review: string | null;
  notes: string;
  evidence: string;
}

export interface Assessment {
  id: ID;
  subject_id: number | null;
  title: string;
  kind: string;
  date_at: string | null;
  confidence: number;
  checklist: string; // JSON
  notes: string;
  done: number;
}

export interface StudySession {
  id: ID;
  subject_id: number | null;
  topic: string;
  objective: string;
  planned_minutes: number;
  actual_minutes: number | null;
  session_type: string;
  task_id: number | null;
  difficulty: string;
  notes: string;
  started_at: string | null;
  ended_at: string | null;
  status: string; // planned|running|paused|completed|cancelled
  reflection: string; // JSON {completed, understood, mistakes, independent, next}
}

export interface Milestone {
  id: ID;
  title: string;
  phase: string;
  description: string;
  due_at: string | null;
  status: string; // todo|doing|done
  position: number;
  owner: string;
}

export interface Experiment {
  id: ID;
  title: string;
  research_question: string;
  hypothesis: string;
  iv: string;
  dv: string;
  controlled_vars: string;
  control_group: string;
  materials: string;
  procedure: string;
  replicates: string;
  observations: string;
  results: string;
  limitations: string;
  next_steps: string;
  created_at: string;
}

export interface Source {
  id: ID;
  title: string;
  author: string;
  pub_date: string;
  url: string;
  source_type: string;
  claim: string;
  evidence: string;
  limitations: string;
  accessed_at: string;
}

export interface Material {
  id: ID;
  name: string;
  quantity: number;
  unit: string;
  unit_price_egp: number;
  supplier: string;
  purchase_status: string;
  intended_use: string;
}

export interface CapstoneEntry {
  id: ID;
  kind: string; // blocker|decision|next
  title: string;
  detail: string;
  resolved: number;
  created_at: string;
}

export interface LearningItem {
  id: ID;
  track: string; // cs50|english-skill|skill
  title: string;
  module: string;
  status: string; // not-started|doing|done|deferred
  detail: string;
  next_action: string;
  updated_at: string;
}

export interface EnglishPractice {
  id: ID;
  skill: string; // listening|reading|vocabulary|writing|speaking|academic
  minutes: number;
  note: string;
  practiced_at: string;
  what_learned: string;
}

export interface Skill {
  id: ID;
  name: string;
  reason: string;
  level: string;
  target: string;
  prereqs: string;
  resources: string;
  evidence: string;
  next_action: string;
  priority: Priority;
  active: number;
}

export interface Competition {
  id: ID;
  name: string;
  organizer: string;
  url: string;
  eligibility: string;
  deadline: string | null;
  cost: string;
  deliverables: string;
  est_hours: number | null;
  status: string;
  next_action: string;
  notes: string;
}

export interface InboxItem {
  id: ID;
  kind: string;
  title: string;
  detail: string;
  created_at: string;
  converted: number;
}

export interface LaterItem {
  id: ID;
  title: string;
  reason_deferred: string;
  tradeoff: string;
  created_at: string;
}

export interface WeeklyReview {
  id: ID;
  week_start: string;
  completed_summary: string;
  difficult_topics: string;
  deadlines: string;
  capstone_evidence: string;
  cs50_count: number;
  english_count: number;
  distraction: string;
  realistic: string;
  sleep: string;
  stop: string;
  cont: string;
  start: string;
  next_outcomes: string; // JSON array
  created_at: string;
}

export interface DailyPlan {
  id: ID;
  date: string; // YYYY-MM-DD unique
  must_task_id: number | null;
  secondary_task_id: number | null;
  optional_task_id: number | null;
  note: string;
  shutdown: string; // JSON checklist
}

export interface SleepCheckin {
  id: ID;
  date: string;
  bedtime: string;
  wake: string;
  hours: number | null;
  energy: number;
  note: string;
}

export type TableName =
  | 'subjects' | 'tasks' | 'subtasks' | 'backlog_items' | 'assessments'
  | 'study_sessions' | 'milestones' | 'experiments' | 'sources' | 'materials'
  | 'capstone_entries' | 'learning_items' | 'english_practice' | 'skills'
  | 'competitions' | 'inbox_items' | 'later_items' | 'weekly_reviews'
  | 'daily_plans' | 'sleep_checkins';

export const ALLOW_TABLES: TableName[] = [
  'subjects', 'tasks', 'subtasks', 'backlog_items', 'assessments',
  'study_sessions', 'milestones', 'experiments', 'sources', 'materials',
  'capstone_entries', 'learning_items', 'english_practice', 'skills',
  'competitions', 'inbox_items', 'later_items', 'weekly_reviews',
  'daily_plans', 'sleep_checkins'
];

export interface SearchHit {
  kind: string;
  id: number;
  title: string;
  subtitle: string;
}
