import React, { useEffect, useState } from 'react';
import { api, isDesktop } from '../lib/api';
import { toCsvCell } from '../../shared/logic';
import { Button, Seg, Confirm } from '../components/ui';
import { IconSettings } from '../components/icons';
import { APP_VERSION } from '../lib/version';

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl + K', 'Global search'],
  ['Q / Ctrl + N', 'Quick add'],
  ['G then H', 'Go Home'],
  ['G then T', 'Today tasks'],
  ['?', 'Shortcut reference'],
  ['Esc', 'Close dialog']
];

export default function SettingsPage(props: { toast: (m: string, e?: boolean) => void; theme: string; setTheme: (t: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [dbPath, setDbPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => {
    void api().settingsAll().then((rows) => {
      const m: Record<string, string> = {};
      for (const r of rows) m[r.key] = r.value;
      setVals(m);
    });
    void api().dbPath().then(setDbPath).catch(() => setDbPath('unavailable'));
  }, []);

  async function set(key: string, value: string) {
    setVals((p) => ({ ...p, [key]: value }));
    try {
      await api().settingSet(key, value);
      if (key === 'theme') props.setTheme(value);
      if (key !== 'dbRecoveredFromCorrupt') props.toast('Setting saved.');
    } catch (e: any) {
      props.toast(e?.message || 'Save failed.', true);
    }
  }

  async function exportJson() {
    setBusy(true);
    try {
      const d = await api().exportData();
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'lifeos-export.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      props.toast('Exported JSON.');
    } catch { props.toast('Export failed.', true); }
    setBusy(false);
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const d = await api().exportData();
      const tasks = d.tasks || [];
      const head = ['id', 'title', 'category', 'priority', 'status', 'due_at'].map(toCsvCell).join(',');
      const csv = head + '\n' + tasks.map((t: any) => [t.id, t.title, t.category, t.priority, t.status, t.due_at || ''].map(toCsvCell).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'lifeos-tasks.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      props.toast('Exported CSV.');
    } catch { props.toast('Export failed.', true); }
    setBusy(false);
  }

  return (
    <div className="stack">
      {vals.dbRecoveredFromCorrupt ? (
        <div className="strip bad small">
          <b>Recovered from a damaged database.</b> The unreadable file was quarantined (never deleted) and Life OS started fresh.
          <br /><span className="micro num">Quarantined: {vals.dbRecoveredFromCorrupt}</span>{' '}
          <span className="link" onClick={() => void set('dbRecoveredFromCorrupt', '')}>Dismiss</span>
        </div>
      ) : null}

      <div className="grid cols-2">
        <div className="panel">
          <div className="panel-head"><h3>Appearance & schedule</h3></div>
          <div className="spread" style={{ marginBottom: 14 }}>
            <span className="small muted">Theme</span>
            <Seg value={props.theme} onChange={(t) => void set('theme', t)} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
          </div>
          <div className="form-grid">
            <label className="field">Week start
              <select value={vals.weekStart || 'sunday'} onChange={(e) => void set('weekStart', e.target.value)}><option value="sunday">Sunday</option><option value="monday">Monday</option></select>
            </label>
            <label className="field">Default session (min)
              <input type="number" min={5} max={180} value={vals.defaultSessionMinutes || '45'} onChange={(e) => void set('defaultSessionMinutes', e.target.value)} />
            </label>
            <label className="field">School start
              <input type="time" value={vals.schoolStart || '07:00'} onChange={(e) => void set('schoolStart', e.target.value)} />
            </label>
            <label className="field">School end
              <input type="time" value={vals.schoolEnd || '15:00'} onChange={(e) => void set('schoolEnd', e.target.value)} />
            </label>
            <label className="field">Wake
              <input type="time" value={vals.wakeTime || '06:00'} onChange={(e) => void set('wakeTime', e.target.value)} />
            </label>
            <label className="field">Bedtime
              <input type="time" value={vals.bedTime || '22:30'} onChange={(e) => void set('bedTime', e.target.value)} />
            </label>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h3>Data safety</h3></div>
            <div className="small muted num" style={{ wordBreak: 'break-all', marginBottom: 4 }}>{dbPath}</div>
            <p className="small faint" style={{ margin: '0 0 12px' }}>Local SQLite · no account · no cloud · parameterized SQL · auto-copies kept at startup.</p>
            <div className="spread" style={{ marginBottom: 12 }}>
              <span className="small">Deadline reminders <span className="faint">· system notification ≤24h</span></span>
              <Seg
                value={vals.notifications === 'on' ? 'on' : 'off'}
                onChange={(v) => {
                  void (async () => {
                    if (v === 'on' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                      try { await Notification.requestPermission(); } catch { /* ignore */ }
                    }
                    await set('notifications', v);
                  })();
                }}
                options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
              />
            </div>
            <div className="row wrap">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void exportJson()}>Export JSON</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void exportCsv()}>Tasks CSV</Button>
              <Button size="sm" variant="subtle" disabled={busy || !isDesktop()} onClick={() => {
                setBusy(true);
                void (async () => {
                  try {
                    const r: any = await api().backup();
                    if (r?.ok) props.toast('Backup saved.');
                  } catch (e: any) { props.toast(e?.message || 'Backup failed.', true); }
                  setBusy(false);
                })();
              }} title={isDesktop() ? 'Save a backup file' : 'Desktop only'}>Backup…</Button>
              <Button size="sm" variant="ghost" disabled={busy || !isDesktop()} onClick={() => setConfirmRestore(true)} title={isDesktop() ? 'Restore from a backup file' : 'Desktop only'}>Restore…</Button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Shortcuts</h3></div>
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="spread small" style={{ padding: '4px 0' }}>
                <span className="muted">{d}</span><kbd>{k}</kbd>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="spread">
              <div className="row"><IconSettings size={16} /><b>Life OS {APP_VERSION}</b></div>
              <span className="micro faint">{isDesktop() ? 'desktop' : 'browser preview'}</span>
            </div>
            <p className="micro faint" style={{ margin: '6px 0 0' }}>Electron + React + TypeScript + SQLite. Works offline. Data stays on this computer. No API keys embedded.</p>
          </div>
        </div>
      </div>

      {confirmRestore && (
        <Confirm
          message="Restore replaces all current data with the backup file. A pre-restore copy is kept next to the database."
          onNo={() => setConfirmRestore(false)}
          onYes={() => {
            setConfirmRestore(false);
            setBusy(true);
            void (async () => {
              try {
                const r: any = await api().restore();
                if (r?.ok) { props.toast('Restored. Reloading…'); setTimeout(() => window.location.reload(), 800); }
              } catch (e: any) { props.toast(e?.message || 'Restore failed.', true); }
              setBusy(false);
            })();
          }}
        />
      )}
    </div>
  );
}
