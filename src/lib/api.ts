// Typed renderer data layer.
// Uses Electron preload (window.lifeos) when present; otherwise falls back to
// a localStorage-backed store so `vite dev` browser preview works offline.

import type { SearchHit, TableName } from '../../shared/types';
import { ALLOW_TABLES } from '../../shared/types';
import { isSafeHttpUrl } from '../../shared/validate';
import { lsGet, lsSet } from './safe';

export interface LifeosBridge {
  list: (table: string, orderBy?: string, limit?: number) => Promise<any[]>;
  get: (table: string, id: number) => Promise<any>;
  create: (table: string, data: Record<string, unknown>) => Promise<number>;
  update: (table: string, id: number, data: Record<string, unknown>) => Promise<boolean>;
  remove: (table: string, id: number) => Promise<boolean>;
  search: (term: string) => Promise<SearchHit[]>;
  openExternal: (url: string) => Promise<boolean>;
  exportData: () => Promise<Record<string, any[]>>;
  backup: () => Promise<any>;
  restore: () => Promise<any>;
  dbPath: () => Promise<string>;
  settingGet: (key: string) => Promise<string | null>;
  settingSet: (key: string, value: string) => Promise<boolean>;
  settingsAll: () => Promise<Array<{ key: string; value: string }>>;
}

declare global {
  interface Window {
    lifeos?: LifeosBridge;
  }
}

const LS_KEY = 'lifeos-fallback-v1';

function readFallback(): Record<string, any[]> {
  const raw = lsGet(LS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* corrupt JSON → reseed below */ }
  }
  const empty: Record<string, any[]> = {};
  for (const t of ALLOW_TABLES) empty[t] = [];
  empty['settings'] = [];
  // seed 11 subjects for browser preview
  const names = ['Mechanics','Computer Science','Arabic','English','Mathematics','Biology','Chemistry','Physics','Geology','German','Other subjects'];
  empty['subjects'] = names.map((name, i) => ({ id: i + 1, name, color: '#7c8aff', archived: 0, current_unit: '', current_topic: '', understanding: 3, next_action: '', notes: '', created_at: new Date().toISOString() }));
  return empty;
}

function writeFallback(data: Record<string, any[]>): void {
  lsSet(LS_KEY, JSON.stringify(data));
}

function fallbackBridge(): LifeosBridge {
  return {
    async list(table) {
      const d = readFallback();
      return [...(d[table] || [])].reverse();
    },
    async get(table, id) {
      const d = readFallback();
      return (d[table] || []).find((r: any) => r.id === id) || null;
    },
    async create(table, data) {
      const d = readFallback();
      const rows = d[table] || [];
      const id = rows.length > 0 ? Math.max(...rows.map((r: any) => r.id)) + 1 : 1;
      rows.push({ id, created_at: new Date().toISOString(), ...data });
      d[table] = rows;
      writeFallback(d);
      return id;
    },
    async update(table, id, data) {
      const d = readFallback();
      d[table] = (d[table] || []).map((r: any) => (r.id === id ? { ...r, ...data } : r));
      writeFallback(d);
      return true;
    },
    async remove(table, id) {
      const d = readFallback();
      d[table] = (d[table] || []).filter((r: any) => r.id !== id);
      writeFallback(d);
      return true;
    },
    async search(term) {
      const q = term.toLowerCase();
      const d = readFallback();
      const out: SearchHit[] = [];
      for (const t of d.tasks || []) {
        if (String(t.title).toLowerCase().includes(q)) out.push({ kind: 'Task', id: t.id, title: t.title, subtitle: t.category || '' });
      }
      for (const s of d.subjects || []) {
        if (String(s.name).toLowerCase().includes(q)) out.push({ kind: 'Subject', id: s.id, title: s.name, subtitle: s.current_topic || '' });
      }
      return out.slice(0, 30);
    },
    async exportData() {
      return readFallback();
    },
    async backup() {
      const blob = new Blob([JSON.stringify(readFallback(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lifeos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      return { ok: true };
    },
    async restore() {
      return { ok: false, message: 'Restore from file is available in the desktop app.' };
    },
    async openExternal(url) {
      if (!isSafeHttpUrl(url)) return false;
      window.open(url.trim(), '_blank', 'noopener,noreferrer');
      return true;
    },
    async dbPath() {
      return 'browser localStorage preview (desktop uses SQLite file)';
    },
    async settingGet(key) {
      const d = readFallback();
      const hit = (d.settings || []).find((s: any) => s.key === key);
      const defaults: Record<string, string> = { theme: 'dark', schoolStart: '07:00', schoolEnd: '15:00', wakeTime: '06:00', bedTime: '22:30', defaultSessionMinutes: '45', weekStart: 'sunday' };
      return hit ? hit.value : (defaults[key] ?? null);
    },
    async settingSet(key, value) {
      const d = readFallback();
      const arr = d.settings || [];
      const i = arr.findIndex((s: any) => s.key === key);
      if (i >= 0) arr[i].value = value;
      else arr.push({ key, value });
      d.settings = arr;
      writeFallback(d);
      return true;
    },
    async settingsAll() {
      return readFallback().settings || [];
    }
  };
}

let cached: LifeosBridge | null = null;

export function api(): LifeosBridge {
  if (cached) return cached;
  if (typeof window !== 'undefined' && window.lifeos) {
    cached = window.lifeos;
    return cached;
  }
  cached = fallbackBridge();
  return cached;
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.lifeos;
}

export type { TableName };
