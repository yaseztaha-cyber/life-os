// Pure input validators shared by main process + unit tests.
// No Node/Electron imports. Validation failures throw UserError (message is
// safe to show in the UI). Anything else is an internal fault and must be
// sanitized by the caller before reaching the renderer.

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export function assertValidId(id: unknown): number {
  const n = typeof id === 'string' && id.trim() !== '' ? Number(id) : id;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 2147483647) {
    throw new UserError('Invalid record id.');
  }
  return n;
}

export function clampLimit(limit: unknown, def = 500): number {
  const n = Number(limit);
  if (!Number.isFinite(n)) return def;
  return Math.min(2000, Math.max(1, Math.floor(n)));
}

/** ORDER BY clause allow-list — prevents SQL injection via sort parameters. */
export function sanitizeOrderBy(orderBy: unknown, allowedCols: string[], def = 'id DESC'): string {
  if (typeof orderBy !== 'string') return def;
  const m = orderBy.trim().match(/^([a-z_][a-z0-9_]*)\s+(ASC|DESC)$/i);
  if (!m) return def;
  const col = m[1].toLowerCase();
  if (!allowedCols.includes(col)) return def;
  return `${col} ${m[2].toUpperCase()}`;
}

export function sanitizeSearchTerm(term: unknown): string {
  if (typeof term !== 'string') return '';
  // Strip control chars, cap length.
  return term.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
}

/** Only http(s) URLs may be opened externally or rendered as links. */
export function isSafeHttpUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const t = url.trim();
  if (t.length === 0 || t.length > 2000) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function assertSettingKey(key: unknown): string {
  if (typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)) {
    throw new UserError('Invalid setting key.');
  }
  return key;
}

export function assertSettingValue(value: unknown): string {
  const s = String(value ?? '');
  if (s.length > 10000) throw new UserError('Setting value is too long (max 10000 chars).');
  return s;
}

export function asText(v: unknown, max: number, field: string): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.length > max) throw new UserError(`${field} is too long (max ${max} chars).`);
  return s;
}

export function asInt(v: unknown, min: number, max: number, field: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new UserError(`${field} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

export function asFloat(v: unknown, min: number, max: number, field: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new UserError(`${field} must be a number between ${min} and ${max}.`);
  }
  return Math.round(n * 100) / 100;
}

export function asEnum<T extends string>(v: unknown, allowed: readonly T[], field: string, def: T): T {
  if (v === null || v === undefined || v === '') return def;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new UserError(`${field} has an invalid value.`);
  }
  return v as T;
}

export function asBoolInt(v: unknown, field: string, def: number): number {
  if (v === null || v === undefined || v === '') return def;
  const n = v === true ? 1 : v === false ? 0 : Number(v);
  if (n !== 0 && n !== 1) throw new UserError(`${field} must be 0 or 1.`);
  return n;
}

export function asIsoDate(v: unknown, field: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || v.length > 40) throw new UserError(`${field} is not a valid date.`);
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new UserError(`${field} is not a valid date.`);
  return v;
}

/** For TEXT columns that store JSON arrays/objects. */
export function asJsonText(v: unknown, max: number, field: string, def: string): string {
  if (v === null || v === undefined || v === '') return def;
  if (typeof v !== 'string' || v.length > max) {
    throw new UserError(`${field} is too long (max ${max} chars).`);
  }
  try {
    JSON.parse(v);
  } catch {
    throw new UserError(`${field} must be valid JSON.`);
  }
  return v;
}

export function asFkId(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) {
    throw new UserError(`${field} must be a valid record reference.`);
  }
  return n;
}
