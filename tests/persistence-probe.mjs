import { _electron as electron } from 'playwright-core';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const exe = path.join(ROOT, 'release', 'win-unpacked', 'Life OS.exe');
const userDir = 'C:\\Users\\DELL\\AppData\\Local\\Temp\\opencode\\lifeos-persist-test';
fs.mkdirSync(userDir, { recursive: true });
const stamp = `Persistence probe ${Date.now()}`;

async function launch() {
  const app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${userDir}`], timeout: 90000 });
  const window = await app.firstWindow({ timeout: 60000 });
  await window.waitForSelector('.nav', { timeout: 30000 });
  await window.waitForTimeout(1200);
  return { app, window };
}

// session 1: add task
{
  const { app, window } = await launch();
  await window.keyboard.press('q');
  await window.waitForSelector('.modal input');
  await window.locator('.modal input').last().fill(stamp);
  await window.locator('.modal button', { hasText: 'Add' }).click();
  await window.waitForTimeout(1000);
  await app.close();
  console.log('session 1: task added, app closed');
}
// session 2: verify it survived restart
{
  const { app, window } = await launch();
  await window.locator('.nav button', { hasText: 'Tasks' }).click();
  await window.waitForTimeout(1000);
  const body = await window.locator('.content').innerText();
  await app.close();
  if (!body.includes(stamp)) throw new Error('persisted task NOT found after restart');
  console.log('session 2: task found after restart — PERSISTENCE PASSED');
}
