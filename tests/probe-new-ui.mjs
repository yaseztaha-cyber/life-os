import { _electron as electron } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const app = await electron.launch({
  executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
  args: [ROOT],
  timeout: 90000,
  env: { ...process.env, LIFEOS_PROD: '1' }
});
const window = await app.firstWindow({ timeout: 60000 });
const errors = [];
window.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await window.waitForSelector('.nav', { timeout: 30000 });
await window.waitForTimeout(1500);

// task modal with subtasks: create a task, open its editor
await window.locator('.nav button', { hasText: 'Tasks' }).click();
await window.waitForTimeout(600);
await window.locator('button', { hasText: 'New task' }).click();
await window.waitForTimeout(400);
await window.locator('.sheet input').first().fill('Probe subtask parent');
await window.locator('.sheet button', { hasText: 'Save task' }).click();
await window.waitForTimeout(800);
await window.locator('.trow .acts button').first().click();
await window.waitForTimeout(600);
await window.screenshot({ path: path.join(ROOT, 'shots', '20-subtasks.png') });
// add a subtask through the UI
const sub = window.locator('input[aria-label="New subtask"]');
if (await sub.count()) {
  await sub.fill('First small step');
  await window.locator('button', { hasText: 'Add' }).last().click();
  await window.waitForTimeout(600);
}
await window.screenshot({ path: path.join(ROOT, 'shots', '21-subtask-added.png') });
await window.keyboard.press('Escape');
await window.waitForTimeout(300);

// subject drawer
await window.locator('.nav button', { hasText: 'School' }).click();
await window.waitForTimeout(800);
await window.locator('.panel.flush .trow').first().click();
await window.waitForTimeout(600);
await window.screenshot({ path: path.join(ROOT, 'shots', '22-subject-drawer.png') });

console.log('errors:', errors.length ? errors : 'none');
await app.close();
console.log('PROBE DONE');
