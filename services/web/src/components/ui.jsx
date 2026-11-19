import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Info,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { ApiError } from '../api/client';

/* --------------------------------------------------------------- Toast */

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((items) => [...items, { id, message, type }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000);
  }, []);
  const remove = useCallback((id) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const value = useMemo(() => ({ push, remove }), [push, remove]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'success' ? <CheckCircle2 size={17} /> : toast.type === 'error' ? <AlertCircle size={17} /> : <Info size={17} />}
            <span>{toast.message}</span>
            <button type="button" onClick={() => remove(toast.id)} aria-label="Закрыть"><X size={15} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast должен использоваться внутри ToastProvider');
  return context;
}

export function describeError(error) {
  if (error instanceof ApiError) {
    const extra = error.details?.computer_ids;
    if (Array.isArray(extra) && extra.length) {
      return `${error.message}: ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ` … (+${extra.length - 5})` : ''}`;
    }
    return error.message;
  }
  return error?.message || 'Неизвестная ошибка';
}

/* --------------------------------------------------------------- Atoms */

export function Button({ variant = 'primary', size = 'md', icon: Icon, children, className = '', ...props }) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${className}`} {...props}>
      {Icon ? <Icon size={size === 'sm' ? 14 : 16} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function Badge({ tone = 'neutral', dot = false, children, className = '' }) {
  return (
    <span className={`badge badge-${tone} ${className}`}>
      {dot ? <i className="badge-dot" /> : null}
      {children}
    </span>
  );
}

export function Card({ title, subtitle, action, children, className = '', padded = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {action ? <div className="card-action">{action}</div> : null}
        </header>
      )}
      <div className={padded ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, actions, tags }) {
  return (
    <div className="page-header">
      <div>
        <div className="page-eyebrow">
          {eyebrow}
          {tags ? <span className="page-tags">{tags}</span> : null}
        </div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'blue', loading = false }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-top">
        <span>{label}</span>
        {Icon ? <span className="stat-icon"><Icon size={17} /></span> : null}
      </div>
      <strong>{loading ? <span className="skeleton skeleton-number" /> : value}</strong>
      <small>{hint}</small>
    </div>
  );
}

export function Note({ tone = 'info', icon: Icon = Info, title, children }) {
  return (
    <div className={`note note-${tone}`}>
      <Icon size={17} />
      <div>
        {title ? <b>{title}</b> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- States / table */

export function LoadingState({ label = 'Загружаем данные…' }) {
  return (
    <div className="state-block">
      <Loader2 className="spin" size={24} />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ title = 'Данных пока нет', description, action }) {
  return (
    <div className="state-block">
      <Inbox size={26} />
      <p className="state-title">{title}</p>
      {description ? <p className="state-description">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Не удалось загрузить данные' }) {
  return (
    <div className="state-block state-error">
      <AlertCircle size={26} />
      <p className="state-title">{title}</p>
      <p className="state-description">{describeError(error)}</p>
      {onRetry ? <Button variant="outline" size="sm" icon={RefreshCw} onClick={onRetry}>Повторить</Button> : null}
    </div>
  );
}

export function DataTable({ columns, rows, rowKey = (row, index) => row.id ?? index, empty, className = '' }) {
  if (!rows?.length) {
    return empty || <EmptyState />;
  }
  return (
    <div className={`table-scroll ${className}`}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{ width: column.width, textAlign: column.align || 'left' }}
                className={column.className || ''}
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key} style={{ textAlign: column.align || 'left' }} className={column.cellClassName || ''}>
                  {column.render ? column.render(row, index) : row[column.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange, hint }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="pagination">
      <span>{hint || `Показано ${from}–${to} из ${total}`}</span>
      <div className="pagination-controls">
        <button type="button" className="page-btn" disabled={page <= 0} onClick={() => onChange(page - 1)} aria-label="Назад">
          <ChevronLeft size={15} />
        </button>
        <span className="page-counter">{page + 1} / {pages}</span>
        <button type="button" className="page-btn" disabled={page >= pages - 1} onClick={() => onChange(page + 1)} aria-label="Вперёд">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Forms */

export function Field({ label, hint, required = false, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}{required ? <em>*</em> : null}</span>
      {children}
      {hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

export function Modal({ open, onClose, title, description, children, footer, width = 560 }) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Удалить', busy = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>{busy ? 'Удаляем…' : confirmLabel}</Button>
        </>
      }
    >
      <p className="confirm-text">{message}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------- Charts */

export function Donut({ value = 0, label, sublabel, tone = 'teal' }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`donut donut-${tone}`} style={{ '--value': `${clamped}%` }}>
      <div className="donut-inner">
        <strong>{Number.isFinite(Number(value)) ? `${Math.round(clamped)}%` : '—'}</strong>
        {label ? <span>{label}</span> : null}
      </div>
      {sublabel ? <p className="donut-sublabel">{sublabel}</p> : null}
    </div>
  );
}

export function BarList({ items = [] }) {
  const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
  return (
    <div className="bar-list">
      {items.map((item, index) => (
        <div className="bar-row" key={item.label || index}>
          <div className="bar-row-head">
            <span>{item.label}</span>
            <b>{item.display ?? item.value}</b>
          </div>
          <div className="bar-track">
            <div className={`bar-fill bar-${item.tone || 'blue'}`} style={{ width: `${((Number(item.value) || 0) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProgressLine({ value = 0, max = 1, label }) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress-line">
      <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
      <span>{label || `${percent}%`}</span>
    </div>
  );
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton skeleton-row" style={{ width: `${92 - index * 7}%` }} />
      ))}
    </div>
  );
}
