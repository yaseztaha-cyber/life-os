import { describe, it, expect } from 'vitest';
import {
  UserError, assertValidId, clampLimit, sanitizeOrderBy, sanitizeSearchTerm,
  isSafeHttpUrl, assertSettingKey, assertSettingValue,
  asText, asInt, asEnum, asIsoDate, asJsonText, asFkId
} from '../shared/validate';
import { sanitizeRow } from '../electron/db';

describe('id + limit validation', () => {
  it('accepts positive ints, rejects junk', () => {
    expect(assertValidId(5)).toBe(5);
    expect(assertValidId('12')).toBe(12);
    for (const bad of [0, -3, 1.5, NaN, 'abc', '', null, undefined, {}, Infinity, 2 ** 31]) {
      expect(() => assertValidId(bad)).toThrow(UserError);
    }
  });
  it('clamps list limits', () => {
    expect(clampLimit(10)).toBe(10);
    expect(clampLimit(999999)).toBe(2000);
    expect(clampLimit(-5)).toBe(1);
    expect(clampLimit('x')).toBe(500);
  });
});

describe('order-by injection', () => {
  const cols = ['id', 'title', 'due_at', 'created_at'];
  it('allows legitimate sorts', () => {
    expect(sanitizeOrderBy('due_at ASC', cols)).toBe('due_at ASC');
    expect(sanitizeOrderBy('id DESC', cols)).toBe('id DESC');
  });
  it('neutralizes injection attempts', () => {
    expect(sanitizeOrderBy('id DESC; DROP TABLE tasks --', cols)).toBe('id DESC');
    expect(sanitizeOrderBy('(SELECT 1) ASC', cols)).toBe('id DESC');
    expect(sanitizeOrderBy('password DESC', cols)).toBe('id DESC');
    expect(sanitizeOrderBy('', cols)).toBe('id DESC');
    expect(sanitizeOrderBy(null, cols)).toBe('id DESC');
    expect(sanitizeOrderBy('id', cols)).toBe('id DESC');
  });
});

describe('search term + urls', () => {
  it('strips control chars and caps length', () => {
    expect(sanitizeSearchTerm('  hello\u0000world  ')).toBe('helloworld');
    expect(sanitizeSearchTerm('x'.repeat(500)).length).toBe(80);
    expect(sanitizeSearchTerm(null)).toBe('');
  });
  it('only allows http(s) external urls', () => {
    expect(isSafeHttpUrl('https://example.com/x')).toBe(true);
    expect(isSafeHttpUrl('http://localhost:1')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd', 'ftp://x', '', 'notaurl', 'https://', 'x'.repeat(3000), null, undefined, 42]) {
      expect(isSafeHttpUrl(bad)).toBe(false);
    }
  });
});

describe('settings keys', () => {
  it('enforces key charset and value length', () => {
    expect(assertSettingKey('theme')).toBe('theme');
    for (const bad of ['__proto__', 'a b', 'x'.repeat(70), '', null, 1, 'a;b', 'a.b']) {
      expect(() => assertSettingKey(bad)).toThrow(UserError);
    }
    expect(() => assertSettingValue('x'.repeat(10001))).toThrow(UserError);
  });
});

describe('value validators', () => {
  it('rejects bad enums, dates, json, lengths', () => {
    expect(() => asEnum('P9', ['P1', 'P2', 'P3'] as const, 'Priority', 'P2')).toThrow(UserError);
    expect(() => asIsoDate('not-a-date', 'Due date')).toThrow(UserError);
    expect(() => asJsonText('{bad', 100, 'Tags', '[]')).toThrow(UserError);
    expect(() => asText('x'.repeat(201), 200, 'Title')).toThrow(UserError);
    expect(() => asInt(1.5, 0, 10, 'N')).toThrow(UserError);
    expect(() => asFkId(-1, 'Subject')).toThrow(UserError);
    expect(asIsoDate(null, 'D')).toBeNull();
  });
});

describe('sanitizeRow (write-path gate)', () => {
  it('creates tasks with defaults and drops unknown columns', () => {
    const out: any = sanitizeRow('tasks', { title: '  Hi  ', evil: '1;DROP TABLE tasks', priority: 'P1' }, false);
    expect(out.title).toBe('  Hi  ');
    expect(out.priority).toBe('P1');
    expect('evil' in out).toBe(false);
    expect(out.status).toBeUndefined(); // defaults live in DB, not injected
  });
  it('requires fields on create, not on update', () => {
    expect(() => sanitizeRow('tasks', { category: 'School' }, false)).toThrow(UserError);
    expect(sanitizeRow('tasks', { status: 'Completed' }, true)).toEqual({ status: 'Completed' });
  });
  it('rejects oversized input and bad enums', () => {
    expect(() => sanitizeRow('tasks', { title: 'x'.repeat(201) }, false)).toThrow(UserError);
    expect(() => sanitizeRow('tasks', { title: 'ok', status: 'Flying' }, false)).toThrow(UserError);
    expect(() => sanitizeRow('backlog_items', { topic: 't', status: 'green' }, false)).not.toThrow();
    expect(() => sanitizeRow('materials', { name: 'm', quantity: -2 }, false)).toThrow(UserError);
    expect(() => sanitizeRow('study_sessions', { objective: 'o', planned_minutes: 9999 }, false)).toThrow(UserError);
  });
  it('guards backlog red->green only at the app layer (DB accepts, UI blocks jumps)', () => {
    const out: any = sanitizeRow('backlog_items', { topic: 't', status: 'green' }, true);
    expect(out.status).toBe('green');
  });
});
