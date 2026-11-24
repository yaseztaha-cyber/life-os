import React, { useEffect, useRef, useState } from 'react';
import { isSafeHttpUrl } from '../../shared/validate';
import { api, isDesktop } from '../lib/api';
import { IconX } from './icons';

/* ---------- buttons ---------- */
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'subtle' | 'danger'; size?: 'md' | 'sm' }) {
  const { variant = 'primary', size = 'md', className = '', ...rest } = props;
  const v = variant === 'primary' ? '' : variant;
  return <button {...rest} className={`btn ${v} ${size === 'sm' ? 'sm' : ''} ${className}`} />;
}

export function IconBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; bordered?: boolean; danger?: boolean }) {
  const { label, bordered, danger, className = '', ...rest } = props;
  return (
    <button
      {...rest} title={label} aria-label={label}
      className={`icon-btn ${bordered ? 'bordered' : ''} ${danger ? 'danger' : ''} ${className}`}
    />
  );
}

/* ---------- fields ---------- */
export function Field(props: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label className={`field ${props.full ? 'full' : ''}`}>{props.label}{props.children}</label>;
}

/* ---------- segmented tabs ---------- */
export function Seg<T extends string>(props: { options: Array<{ value: T; label: string; icon?: React.ReactNode }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {props.options.map((o) => (
        <button key={o.value} role="tab" aria-selected={props.value === o.value} className={props.value === o.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- modal sheet ---------- */
const modalStack = { count: 0 };

export function Modal(props: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  useEffect(() => {
    const id = ++modalStack.count;
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost sheet answers Escape (nested confirms coexist).
      if (e.key === 'Escape' && id === modalStack.count) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      modalStack.count = Math.max(0, modalStack.count - 1);
    };
  }, []);
  return (
    <>
      <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }} />
      <div className={`sheet modal ${props.wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="spread" style={{ marginBottom: 4 }}>
          <div className="grow">
            <h3>{props.title}</h3>
            {props.sub && <div className="sub">{props.sub}</div>}
          </div>
          <IconBtn label="Close" onClick={props.onClose}><IconX size={15} /></IconBtn>
        </div>
        {props.children}
        {props.footer && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>{props.footer}</div>}
      </div>
    </>
  );
}

export function Confirm(props: { message: string; onYes: () => void; onNo: () => void }) {
  return (
    <Modal title="Are you sure?" onClose={props.onNo} footer={<><Button variant="ghost" onClick={props.onNo}>Cancel</Button><Button variant="danger" onClick={props.onYes}>Delete</Button></>}>
      <p className="muted" style={{ margin: '8px 0 0' }}>{props.message}</p>
    </Modal>
  );
}

/* ---------- data display ---------- */
const PILL_ALIASES: Record<string, string> = {
  Completed: 'done', completed: 'done', Done: 'done', done: 'done',
  'In progress': 'In-progress', running: 'running', doing: 'doing',
  todo: 'todo', Todo: 'todo', Planned: 'Planned', Inbox: 'Inbox',
  paused: 'paused', planned: 'planned', next: 'next', idea: 'idea',
  task: 'task', 'not-started': 'not-started', green: 'green', yellow: 'yellow', red: 'red'
};

export function Pill(props: { text: string; kind?: string }) {
  const key = props.kind || PILL_ALIASES[props.text] || props.text;
  const cls = `pill p-${String(key).replace(/[^a-zA-Z-]/g, '')}`;
  return <span className={cls}>{props.text}</span>;
}

export function Bar(props: { pct: number; good?: boolean }) {
  const p = Math.min(100, Math.max(0, Math.round(props.pct)));
  return <div className={`bar ${props.good ? 'good' : ''}`}><div style={{ width: `${p}%` }} /></div>;
}

export function Stat(props: { value: string; label: string }) {
  return <div className="stat"><span className="v">{props.value}</span><span className="l">{props.label}</span></div>;
}

export function Dots(props: { value: number; max?: number }) {
  const max = props.max ?? 5;
  return (
    <span className="urating" title={`${props.value}/${max}`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < props.value ? 'f' : ''} />)}
    </span>
  );
}

export function EmptyState(props: { icon: React.ReactNode; title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="empty">
      <div className="glyph">{props.icon}</div>
      <h4>{props.title}</h4>
      <p>{props.body}</p>
      {props.actionLabel && props.onAction && <Button onClick={props.onAction}>{props.actionLabel}</Button>}
    </div>
  );
}

/* ---------- errors & links ---------- */
export class ErrorBoundary extends React.Component<{ page: string; children: React.ReactNode }, { error: string | null }> {
  constructor(props: { page: string; children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
  componentDidCatch(e: unknown): void {
    console.error('Life OS page error:', e);
  }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="panel">
          <div className="empty">
            <div className="glyph"><IconX size={20} /></div>
            <h4>This page hit an error</h4>
            <p>{this.state.error} Your saved data is untouched.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button onClick={() => this.setState({ error: null })}>Try again</Button>
              <Button variant="ghost" onClick={() => window.location.reload()}>Reload app</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SafeLink(props: { url: string }) {
  const { url } = props;
  if (!isSafeHttpUrl(url)) return <span>{url}</span>;
  const open = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      if (isDesktop()) await api().openExternal(url.trim());
      else window.open(url.trim(), '_blank', 'noopener,noreferrer');
    } catch {
      window.open(url.trim(), '_blank', 'noopener,noreferrer');
    }
  };
  return <a href={url} onClick={(e) => void open(e)} rel="noreferrer" className="link">{url}</a>;
}

/* ---------- toasts ---------- */
export function useToast(): { toast: (msg: string, isErr?: boolean) => void; node: React.ReactNode } {
  const [items, setItems] = useState<Array<{ id: string; msg: string; err: boolean }>>([]);
  const toast = (msg: string, isErr = false) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev.slice(-3), { id, msg, err: isErr }]);
    setTimeout(() => setItems((prev) => prev.filter((p) => p.id !== id)), 3400);
  };
  const node = (
    <div className="toasts" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className={`toast ${i.err ? 'err' : ''}`}>{i.msg}</div>
      ))}
    </div>
  );
  return { toast, node };
}
