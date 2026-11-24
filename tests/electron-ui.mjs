// Electron UI smoke test — launches the REAL desktop app, drives it like a user.
// Run: node tests/electron-ui.mjs   (requires npm run build first)
import { _electron as electron } from 'playwright-core';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
async function main() {
  const app = await electron.launch({
    executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [path.join(ROOT)],
    timeout: 90000,
    env: { ...process.env, LIFEOS_PROD: '1' }
  });
  const window = await app.firstWindow({ timeout: 60000 });
  window.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  window.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await window.waitForSelector('.nav', { timeout: 30000 });
  await window.waitForTimeout(1500);

  const navCount = await window.locator('.nav button').count();
  console.log('nav items:', navCount);
  if (navCount !== 12) throw new Error(`expected 12 nav items, got ${navCount}`);

  const shot = (n) => window.screenshot({ path: path.join(SHOTS, n) });

  // 1. empty home (fresh userData? keep real one — shows onboarding if empty)
  await shot('01-home.png');

  // 2. quick-add a task via keyboard (Q)
  await window.keyboard.press('q');
  await window.waitForSelector('.modal input');
  await window.locator('.modal input').last().fill('Verify planner overload warning');
  await window.locator('.modal button', { hasText: 'Add' }).click();
  await window.waitForTimeout(800);
  await shot('02-home-populated.png');

  // 3. Tasks page
  await window.locator('.nav button', { hasText: 'Tasks' }).click();
  await window.waitForTimeout(800);
  await shot('03-tasks.png');

  // 4. School page
  await window.locator('.nav button', { hasText: 'School' }).click();
  await window.waitForTimeout(800);
  await shot('04-school.png');

  // 5. Planner page
  await window.locator('.nav button', { hasText: 'Planner' }).click();
  await window.waitForTimeout(800);
  await shot('05-planner.png');

  // 6. Sessions page
  await window.locator('.nav button', { hasText: 'Study Sessions' }).click();
  await window.waitForTimeout(800);
  await shot('06-sessions.png');

  // 7. Capstone page
  await window.locator('.nav button', { hasText: 'Capstone' }).click();
  await window.waitForTimeout(800);
  await shot('07-capstone.png');

  // 8. Search (Ctrl+K)
  await window.keyboard.press('Control+k');
  await window.waitForTimeout(600);
  await window.locator('.modal input').first().fill('Verify');
  await window.waitForTimeout(800);
  await shot('08-search.png');
  await window.keyboard.press('Escape');

  // 9. Settings + light theme
  await window.locator('.nav button', { hasText: 'Settings' }).click();
  await window.waitForTimeout(600);
  await window.locator('button', { hasText: 'Light' }).click();
  await window.waitForTimeout(600);
  await shot('09-settings-light.png');
  await window.locator('button', { hasText: 'Dark' }).first().click();
  await window.waitForTimeout(400);

  // 10. Learning / Competitions / Reviews / Insights / Inbox
  for (const name of ['Learning', 'Competitions', 'Weekly Reviews', 'Insights', 'Inbox']) {
    await window.locator('.nav button', { hasText: name }).click();
    await window.waitForTimeout(500);
  }
  await window.locator('.nav button', { hasText: 'Inbox' }).click();
  await window.waitForTimeout(600);
  await shot('10-inbox.png');

  console.log('console/page errors:', errors.length ? errors : 'none');
  await app.close();
  console.log('ELECTRON UI SMOKE PASSED');
}

main().catch((e) => { console.error('FAIL:', e.message); errors.length && console.error(errors); process.exit(1); });
