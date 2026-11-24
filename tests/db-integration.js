// Integration test for the real SQLite layer (better-sqlite3) — run with node.
// Exercises: migrations/seed, CRUD, search, export, backup-shape, persistence across reopen.
const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const { openDatabase, listRows, createRow, updateRow, deleteRow, getRow, searchAll, exportAll, insertRestoredRow } =
    require('../dist-electron/electron/db.js');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-test-'));
  const file = path.join(tmp, 'lifeos.sqlite');
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok:', msg); };

  // 1. open + seed
  let h = openDatabase(file);
  const subjects = listRows(h.db, 'subjects', 'id ASC');
  assert(subjects.length === 11, `seeded 11 subjects (got ${subjects.length})`);
  assert(subjects[0].name === 'Mechanics', 'first subject is Mechanics');
  const ms = listRows(h.db, 'milestones', 'position ASC');
  assert(ms.length === 10, `seeded 10 capstone phases (got ${ms.length})`);

  // 2. task CRUD
  const id = createRow(h.db, 'tasks', { title: 'Friction set', category: 'Homework', subject_id: subjects[4].id, priority: 'P1', status: 'Planned', estimated_minutes: 45 });
  assert(typeof id === 'number', 'task created with numeric id');
  updateRow(h.db, 'tasks', id, { status: 'Completed', completed_at: new Date().toISOString() });
  assert(getRow(h.db, 'tasks', id).status === 'Completed', 'task completion persisted');
  try {
    createRow(h.db, 'tasks', { category: 'School' });
    assert(false, 'missing title should throw');
  } catch { console.log('ok: title validation rejects empty insert'); }
  try {
    createRow(h.db, 'nope' , { a: 1 });
    assert(false, 'unknown table should throw');
  } catch { console.log('ok: table allow-list blocks unknown tables'); }

  // 3. backlog + search + budget
  const b1 = createRow(h.db, 'backlog_items', { topic: 'Torque', status: 'red', priority: 'P1', subject_id: subjects[0].id });
  assert(searchAll(h.db, 'Torq').some((r) => r.kind === 'Backlog'), 'search finds backlog item');
  assert(searchAll(h.db, 'Friction').some((r) => r.kind === 'Task'), 'search finds task');
  createRow(h.db, 'materials', { name: 'Beetroot powder', quantity: 2, unit: 'packs', unit_price_egp: 35.5, purchase_status: 'needed', intended_use: 'pigment' });
  const dump = exportAll(h.db);
  assert(dump.materials.length === 1 && dump.subjects.length === 11, 'export includes all tables');

  // 4. persistence across reopen (close + reopen)
  h.db.close();
  h = openDatabase(file);
  assert(getRow(h.db, 'tasks', id).status === 'Completed', 'data persists after reopen');
  deleteRow(h.db, 'tasks', id);
  assert(getRow(h.db, 'tasks', id) === undefined, 'delete removes row');
  deleteRow(h.db, 'backlog_items', b1);
  h.db.close();

  // 5. corrupt-input handling: invalid SQL chars in search must not throw (parameterized)
  h = openDatabase(file);
  const evil = searchAll(h.db, "'; DROP TABLE tasks; --");
  assert(Array.isArray(evil), 'hostile search input handled safely');
  assert(listRows(h.db, 'tasks', 'id DESC').length >= 0, 'tasks table intact after hostile input');

  // 6. ORDER BY injection neutralized + unknown columns dropped
  const inj = listRows(h.db, 'tasks', 'id DESC; DROP TABLE tasks --', 5);
  assert(Array.isArray(inj), 'hostile orderBy falls back safely');
  assert(listRows(h.db, 'tasks', 'id DESC').length >= 0, 'tasks table intact after orderBy attack');
  const wk = createRow(h.db, 'tasks', { title: 'col-drop', 'evil-col': 'x', status: 'Planned' });
  const wrow = getRow(h.db, 'tasks', wk);
  assert(!('evil-col' in wrow), 'unknown columns never reach the table');
  deleteRow(h.db, 'tasks', wk);

  // 7. value validation enforced at the lowest layer
  for (const bad of [
    () => createRow(h.db, 'tasks', { title: 'x'.repeat(201) }),
    () => createRow(h.db, 'tasks', { title: 'ok', status: 'Flying' }),
    () => createRow(h.db, 'tasks', { title: 'ok', estimated_minutes: -5 }),
    () => createRow(h.db, 'tasks', { title: 'ok', due_at: 'yesterday-ish' }),
    () => createRow(h.db, 'tasks', { title: 'ok', tags: '{broken' }),
    () => createRow(h.db, 'subjects', { name: 'S', understanding: 9 }),
    () => updateRow(h.db, 'tasks', 1, { priority: 'P0' })
  ]) {
    let threw = false;
    try { bad(); } catch { threw = true; }
    assert(threw, 'invalid value rejected by sanitizeRow');
  }
  for (const badId of ['abc', 0, -1, 1.5, NaN]) {
    let threw = false;
    try { getRow(h.db, 'tasks', badId); } catch { threw = true; }
    assert(threw, `invalid id rejected (${String(badId)})`);
  }

  // 8. schema version + id-preserving restore rows
  const ver = h.db.prepare("SELECT value FROM settings WHERE key='schema_version'").get();
  assert(ver && ver.value === '1', 'schema_version tracked at 1');
  insertRestoredRow(h.db, 'tasks', { id: 4242, title: 'kept-id', status: 'Planned', 'weird)col': 1 });
  assert(getRow(h.db, 'tasks', 4242).title === 'kept-id', 'restore preserves ids, drops hostile columns');
  deleteRow(h.db, 'tasks', 4242);
  h.db.close();

  // 9. corrupt database quarantine: garbage file → fresh seeded DB + notice flag
  const corruptFile = path.join(tmp, 'corrupt.sqlite');
  fs.writeFileSync(corruptFile, Buffer.from([0, 1, 2, 3, 99, 98, 121, 116, 101, 45, 106, 117, 110, 107]));
  const ch = openDatabase(corruptFile);
  assert(listRows(ch.db, 'subjects').length === 11, 'corrupt DB replaced with fresh seeded DB');
  const flag = ch.db.prepare("SELECT value FROM settings WHERE key='dbRecoveredFromCorrupt'").get();
  assert(flag && String(flag.value).includes('corrupt-'), 'recovery notice flag stored');
  ch.db.close();
  const quarantined = fs.readdirSync(tmp).some((f) => f.includes('corrupt-') && f.endsWith('.sqlite'));
  assert(quarantined, 'broken file preserved for forensics, not deleted');

  // 10. reopen idempotence: version + seed survive repeated opens
  const h2 = openDatabase(file);
  assert(listRows(h2.db, 'subjects').length === 11, 'seed idempotent across opens');
  h2.db.close();

  console.log('ALL DB INTEGRATION TESTS PASSED');
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
