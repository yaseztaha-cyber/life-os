// Storage access that never throws (file:// in Electron blocks localStorage,
// private mode may too). All failures degrade to in-memory behavior.

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch { /* ignore: quota, permissions, opaque origin */ }
}

export function lsDel(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}
