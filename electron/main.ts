import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { openDatabase, listRows, getRow, createRow, updateRow, deleteRow, insertRestoredRow, searchAll, exportAll, assertTable, repairInterruptedSessions } from './db';
import { TableName, ALLOW_TABLES } from '../shared/types';
import { assertValidId, clampLimit, sanitizeSearchTerm, isSafeHttpUrl, assertSettingKey, assertSettingValue, UserError } from '../shared/validate';

let mainWindow: BrowserWindow | null = null;
let dbHandle: { db: any; filePath: string } | null = null;

function dbPath(): string {
  return path.join(app.getPath('userData'), 'lifeos.sqlite');
}

function isDev(): boolean {
  if (process.env.LIFEOS_PROD === '1') return false;
  return !app.isPackaged;
}

interface WinState { x?: number; y?: number; width?: number; height?: number; maximized?: boolean }

function windowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WinState {
  try {
    const raw = fs.readFileSync(windowStatePath(), 'utf-8');
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return {};
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const width = num(s.width);
    const height = num(s.height);
    if (!width || !height || width < 980 || height < 640 || width > 5000 || height > 3000) return {};
    return { x: num(s.x), y: num(s.y), width: Math.floor(width), height: Math.floor(height), maximized: s.maximized === true };
  } catch {
    return {};
  }
}

function watchWindowState(win: BrowserWindow): void {
  let t: NodeJS.Timeout | null = null;
  const save = () => {
    try {
      if (win.isDestroyed()) return;
      const b = win.getBounds();
      fs.writeFileSync(windowStatePath(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
    } catch { /* ignore */ }
  };
  const soon = () => {
    if (t) clearTimeout(t);
    t = setTimeout(save, 500);
  };
  win.on('resize', soon);
  win.on('move', soon);
  win.on('close', save);
}

async function createWindow(): Promise<void> {
  const saved = loadWindowState();
  mainWindow = new BrowserWindow({
    width: saved.width || 1280,
    height: saved.height || 860,
    x: saved.x,
    y: saved.y,
    minWidth: 980,
    minHeight: 640,
    title: 'Life OS',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0f1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  watchWindowState(mainWindow);
  if (saved.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Never open external pages inside the app window. External URLs are
  // opened in the system browser only via the validated open-external IPC.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allowed = url.startsWith('file://') || url.startsWith('http://localhost:5173');
    if (!allowed) e.preventDefault();
  });

  if (isDev()) {
    const url = process.env.VITE_DEV_URL || 'http://localhost:5173';
    try {
      await mainWindow.loadURL(url);
    } catch (e: any) {
      console.error(`Life OS: loadURL failed (${url}):`, e?.message || e);
    }
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexHtml = path.join(__dirname, '../../dist-renderer/index.html');
    try {
      await mainWindow.loadFile(indexHtml);
    } catch (e: any) {
      console.error(`Life OS: loadFile failed (${indexHtml}):`, e?.message || e);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function requireDb(): any {
  if (!dbHandle) throw new Error('Database is unavailable. Restart the app; your data file is preserved.');
  return dbHandle.db;
}

/**
 * IPC wrapper: full errors stay in the main-process log; the renderer only
 * ever sees UserError messages (safe by construction) or a generic fallback.
 */
function safeIpc(channel: string, fn: (e: unknown, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (e, ...args) => {
    try {
      return await fn(e, ...args);
    } catch (err: any) {
      if (err instanceof UserError) throw err;
      console.error(`Life OS IPC ${channel} failed:`, err?.message || err);
      throw new Error('Request failed. Check the data and try again.');
    }
  });
}

function registerIpc(): void {
  safeIpc('lifeos:list', (_e, table: string, orderBy?: string, limit?: number) => {
    assertTable(table);
    return listRows(requireDb(), table as TableName, orderBy || 'id DESC', clampLimit(limit));
  });
  safeIpc('lifeos:get', (_e, table: string, id: number) => {
    assertTable(table);
    return getRow(requireDb(), table as TableName, assertValidId(id));
  });
  safeIpc('lifeos:create', (_e, table: string, data: Record<string, unknown>) => {
    assertTable(table);
    return createRow(requireDb(), table as TableName, data);
  });
  safeIpc('lifeos:update', (_e, table: string, id: number, data: Record<string, unknown>) => {
    assertTable(table);
    updateRow(requireDb(), table as TableName, assertValidId(id), data);
    return true;
  });
  safeIpc('lifeos:remove', (_e, table: string, id: number) => {
    assertTable(table);
    deleteRow(requireDb(), table as TableName, assertValidId(id));
    return true;
  });
  safeIpc('lifeos:search', (_e, term: string) => {
    const clean = sanitizeSearchTerm(term);
    if (!clean) return [];
    return searchAll(requireDb(), clean);
  });
  safeIpc('lifeos:open-external', (_e, url: string) => {
    if (!isSafeHttpUrl(url)) throw new UserError('URL is not supported. Only http(s) links can be opened.');
    void shell.openExternal(url.trim());
    return true;
  });
  safeIpc('lifeos:export', () => exportAll(requireDb()));
  safeIpc('lifeos:setting:get', (_e, key: string) => {
    const k = assertSettingKey(key);
    const row = requireDb().prepare('SELECT value FROM settings WHERE key = ?').get(k) as any;
    return row ? row.value : null;
  });
  safeIpc('lifeos:setting:set', (_e, key: string, value: string) => {
    const k = assertSettingKey(key);
    const v = assertSettingValue(value);
    requireDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);
    return true;
  });
  safeIpc('lifeos:settings:all', () => {
    return requireDb().prepare('SELECT key, value FROM settings').all();
  });
  safeIpc('lifeos:backup', async () => {
    if (!mainWindow) throw new UserError('App window is not ready.');
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Backup Life OS data',
      defaultPath: `lifeos-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!filePath) return { ok: false, cancelled: true };
    const dump = exportAll(requireDb());
    try {
      fs.writeFileSync(filePath, JSON.stringify({ app: 'life-os', version: 1, exportedAt: new Date().toISOString(), data: dump }, null, 2));
    } catch {
      throw new UserError('Could not write the backup file. Check the folder permissions.');
    }
    return { ok: true, filePath };
  });
  safeIpc('lifeos:restore', async () => {
    if (!mainWindow) throw new UserError('App window is not ready.');
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'Restore Life OS backup',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || filePaths.length === 0) return { ok: false, cancelled: true };
    // Bound the damage a malicious/huge file can do before parsing.
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePaths[0]);
    } catch {
      throw new UserError('Could not read the backup file.');
    }
    const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
    if (stat.size > MAX_BACKUP_BYTES) throw new UserError('Backup file is too large (max 50 MB).');
    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    } catch {
      throw new UserError('Backup file is not valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
      throw new UserError('Backup file has an unsupported format.');
    }
    const data = parsed.data as Record<string, unknown>;
    // Backup current db file first
    try {
      const bak = dbHandle!.filePath + `.pre-restore-${Date.now()}.bak`;
      fs.copyFileSync(dbHandle!.filePath, bak);
    } catch { /* ignore */ }
    const db = requireDb();
    const MAX_ROWS = 200000;
    const txn = db.transaction(() => {
      db.pragma('foreign_keys = OFF');
      try {
        // Delete children before parents (reverse dependency order).
        for (const t of [...ALLOW_TABLES].reverse()) {
          db.prepare(`DELETE FROM ${t}`).run();
        }
        for (const [t, rows] of Object.entries(data)) {
          if (t === 'settings') continue;
          try {
            assertTable(t);
          } catch { continue; }
          if (!Array.isArray(rows)) continue;
          for (const r of rows.slice(0, MAX_ROWS)) {
            try {
              insertRestoredRow(db, t as TableName, r as Record<string, unknown>);
            } catch { /* skip bad row, keep the rest */ }
          }
        }
        if (Array.isArray((data as any).settings)) {
          const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
          for (const s of (data as any).settings.slice(0, 1000)) {
            try {
              put.run(assertSettingKey(s?.key), assertSettingValue(s?.value));
            } catch { /* skip bad setting */ }
          }
        }
      } finally {
        db.pragma('foreign_keys = ON');
      }
    });
    try {
      txn();
    } catch {
      throw new UserError('Restore failed. Your previous data was backed up next to the database file.');
    }
    try {
      repairInterruptedSessions(db);
    } catch { /* ignore */ }
    return { ok: true };
  });
  safeIpc('lifeos:dbpath', () => {
    if (!dbHandle) throw new UserError('Database is unavailable.');
    return dbHandle.filePath;
  });
}

/** Best-effort startup copy of the database; prunes to the newest 5. */
function startupBackup(filePath: string): void {
  try {
    const dir = path.join(path.dirname(filePath), 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(filePath, path.join(dir, `lifeos-auto-${stamp}.sqlite`));
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('lifeos-auto-') && f.endsWith('.sqlite'))
      .sort();
    for (const old of files.slice(0, Math.max(0, files.length - 5))) {
      try { fs.unlinkSync(path.join(dir, old)); } catch { /* ignore */ }
    }
  } catch (e: any) {
    console.error('Life OS: startup backup failed:', e?.message || e);
  }
}

function startApp(): void {
  try {
    dbHandle = openDatabase(dbPath());
    startupBackup(dbHandle.filePath);
  } catch (e: any) {
    console.error('Life OS: failed to open database:', e?.message || e);
  }
  registerIpc();
  void createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}

// Single instance: a second launch focuses the running window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  if (process.platform === 'win32') app.setAppUserModelId('com.lifeos.student');
  process.on('uncaughtException', (e) => console.error('Life OS uncaughtException:', e?.message || e));
  process.on('unhandledRejection', (e: any) => console.error('Life OS unhandledRejection:', e?.message || e));
  app.whenReady().then(startApp).catch((e) => console.error('Life OS startup failed:', e));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
