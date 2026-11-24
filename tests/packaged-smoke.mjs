import { _electron as electron } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const exe = path.join(ROOT, 'release', 'win-unpacked', 'Life OS.exe');
const app = await electron.launch({ executablePath: exe, timeout: 90000 });
const window = await app.firstWindow({ timeout: 60000 });
const errors = [];
window.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await window.waitForSelector('.nav', { timeout: 30000 });
await window.waitForTimeout(2000);
const navCount = await window.locator('.nav button').count();
const subjectsLine = await window.locator('.statusbar').innerText();
console.log('packaged nav items:', navCount);
console.log('packaged statusbar:', subjectsLine.replace(/\n/g, ' | '));
await window.screenshot({ path: path.join(ROOT, 'shots', '11-packaged.png') });
console.log('packaged errors:', errors.length ? errors : 'none');
await app.close();
if (navCount !== 12) throw new Error('nav mismatch in packaged app');
console.log('PACKAGED APP SMOKE PASSED');
