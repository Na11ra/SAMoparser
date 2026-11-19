import { useMemo, useState } from 'react';
import { GitCompareArrows, HardDrive, Plus, Search, Trash2 } from 'lucide-react';
import { useAppData, useAsync } from '../app/AppDataContext';
import { useMutation } from '../app/useMutation';
import { suggestMatches } from '../lib/matching';
import { formatDate, formatNumber, matchStatusLabel } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Note,
  PageHeader,
  Pagination,
} from '../components/ui';

const PAGE_SIZE = 25;
const EMPTY_FORM = { computer_id: '', name: '', publisher: '', version: '' };

export default function Installations() {
  const { api, version, devices, catalog, refresh } = useAppData();
  const { busy, run } = useMutation();
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [resolveRow, setResolveRow] = useState(null);
  const [resolveName, setResolveName] = useState('');
  const [resolveModalReady, setResolveModalReady] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const pageData = useAsync(
    () => api.listInstallations({
      status: statusFilter || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [statusFilter, page, version],
  );

  const suggestions = useMemo(
    () => (resolveRow ? suggestMatches(resolveRow.name, catalog.data || [], 5) : []),
    [resolveRow, catalog.data],
  );

  const items = pageData.data?.items || [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.computer_id} ${item.name} ${item.canonical_name || ''} ${item.publisher}`.toLowerCase().includes(needle));
  }, [items, query]);

  function openAdd() {
    setForm({ ...EMPTY_FORM, computer_id: devices.data?.[0]?.computer_id || '' });
    setAddModal(true);
  }
  function update(key, value) { setForm((previous) => ({ ...previous, [key]: value })); }

  async function add() {
    if (!form.computer_id || !form.name.trim()) return;
    const result = await run(() => api.addInstallation({
      computer_id: form.computer_id,
      name: form.name.trim(),
      publisher: form.publisher.trim(),
      version: form.version.trim(),
    }), { success: 'Установка добавлена' });
    if (result.ok) setAddModal(false);
  }

  function openResolve(row) {
    setResolveRow(row);
    setResolveName(suggestionsTopName(row));
    setResolveModalReady(true);
  }

  function suggestionsTopName(row) {
    const top = suggestMatches(row.name, catalog.data || [], 1)[0];
    return top?.score >= 0.55 ? top.product.name : catalog.data?.[0]?.name || '';
  }

  async function resolve() {
    if (!resolveRow || !resolveName) return;
    const result = await run(() => api.resolveMatch(resolveRow.name, resolveName), {
      success: (data) => `Подтверждено: обновлено ${formatNumber(data.updated)} установок`,
    });
    if (result.ok) { setResolveModalReady(false); setResolveRow(null); }
  }

  async function remove() {
    if (!confirm) return;
    const result = await run(() => api.deleteInstallation(confirm.id), { success: 'Установка удалена' });
    if (result.ok) setConfirm(null);
  }

  const columns = [
    { key: 'id', title: '#', width: 60, render: (row) => <span className="mono muted">{row.id ?? '—'}</span> },
    { key: 'computer_id', title: 'Компьютер', render: (row) => <b className="cell-strong mono">{row.computer_id}</b> },
    { key: 'name', title: 'Имя из источника', render: (row) => <div><b className="cell-strong">{row.name}</b><small>{[row.publisher, row.version].filter(Boolean).join(' · ') || '—'}</small></div> },
    { key: 'canonical_name', title: 'Каталог', render: (row) => row.canonical_name || <span className="muted">не сопоставлено</span> },
    { key: 'match_status', title: 'Статус', render: (row) => <Badge tone={row.match_status === 'matched' ? 'success' : 'warning'}>{matchStatusLabel(row.match_status)}</Badge> },
    { key: 'match_score', title: 'Оценка', align: 'right', render: (row) => `${Math.round((row.match_score || 0) * 100)}%` },
    { key: 'observed_at', title: 'Обнаружено', render: (row) => formatDate(row.observed_at) },
    { key: 'actions', title: '', align: 'right', render: (row) => (
      <div className="row-actions">
        {row.match_status !== 'matched' ? (
          <button type="button" className="icon-btn" title="Связать с каталогом" onClick={() => openResolve(row)}><GitCompareArrows size={15} /></button>
        ) : null}
        <button type="button" className="icon-btn icon-btn-danger" title="Удалить установку" disabled={!row.id} onClick={() => setConfirm(row)}><Trash2 size={15} /></button>
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Данные"
        title="Установки на компьютерах"
        description="Факты установленного ПО, результаты сопоставления и ручное ведение записей."
        actions={<Button icon={Plus} onClick={openAdd} disabled={!devices.data?.length}>Добавить установку</Button>}
      />

      <Note tone="info" title="Серверная пагинация">
        Список читается через <code>GET /api/v1/installations</code> с <code>limit</code>/<code>offset</code> и фильтром <code>status</code>. Текстовый поиск ниже работает по загруженной странице — для поиска по всему массиву используйте фильтры и «Проверку имён».
      </Note>

      {pageData.error ? <Card><ErrorState error={pageData.error} onRetry={pageData.reload} /></Card> : null}

      <Card padded={false} title="Факты установки" subtitle={`Всего записей: ${formatNumber(pageData.data?.total)}`} action={<HardDrive size={18} className="muted" />}>
        <div className="toolbar">
          <div className="search-input"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по текущей странице" /></div>
          <select className="select" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}>
            <option value="">Статус: все</option>
            <option value="matched">Сопоставлено</option>
            <option value="unknown">Не распознано</option>
          </select>
          <span className="muted small">Страница: {PAGE_SIZE} записей</span>
        </div>

        {pageData.loading ? <LoadingState label="Загружаем страницу установок…" /> : (
          <DataTable
            columns={columns}
            rows={filtered}
            empty={<p className="muted pad">На этой странице нет записей по выбранным условиям.</p>}
          />
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={pageData.data?.total || 0} onChange={setPage} />
      </Card>

      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="Добавить факт установки"
        description="POST /api/v1/installations: имя тут же пройдёт точное сопоставление с каталогом."
        footer={<><Button variant="ghost" onClick={() => setAddModal(false)}>Отмена</Button><Button onClick={add} disabled={busy || !form.name.trim() || !form.computer_id}>{busy ? 'Сохраняем…' : 'Добавить'}</Button></>}
      >
        <div className="form-grid">
          <Field label="Компьютер" required hint="Только зарегистрированные устройства.">
            <select className="select" value={form.computer_id} onChange={(event) => update('computer_id', event.target.value)}>
              {(devices.data || []).map((device) => <option key={device.computer_id} value={device.computer_id}>{device.computer_id}{device.display_name ? ` — ${device.display_name}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Имя ПО / процесса" required hint="Можно указать «грязное» имя, например studio_visual_2022.exe."><input className="input" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="chrome_setup.exe" /></Field>
          <Field label="Издатель"><input className="input" value={form.publisher} onChange={(event) => update('publisher', event.target.value)} placeholder="Google LLC" /></Field>
          <Field label="Версия"><input className="input" value={form.version} onChange={(event) => update('version', event.target.value)} placeholder="130.0" /></Field>
        </div>
      </Modal>

      <Modal
        open={resolveModalReady && Boolean(resolveRow)}
        onClose={() => { setResolveModalReady(false); setResolveRow(null); }}
        title="Подтвердить сопоставление"
        description="Human-in-the-loop: решение человека через POST /api/v1/review."
        footer={<><Button variant="ghost" onClick={() => { setResolveModalReady(false); setResolveRow(null); }}>Отмена</Button><Button onClick={resolve} disabled={busy || !resolveName}>{busy ? 'Применяем…' : 'Подтвердить'}</Button></>}
      >
        <p className="muted">Грязное имя: <code>{resolveRow?.name}</code>. Решение применится ко всем установкам с таким же исходным именем.</p>
        <Field label="Канонический продукт из каталога" required>
          <select className="select" value={resolveName} onChange={(event) => setResolveName(event.target.value)}>
            {(catalog.data || []).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </Field>
        {suggestions.length ? (
          <div className="suggestion-list">
            <b className="small">Подсказки локального офлайн-матчера (не LLM):</b>
            {suggestions.map((item) => (
              <button type="button" key={item.product.name} className={`suggestion ${resolveName === item.product.name ? 'suggestion-active' : ''}`} onClick={() => setResolveName(item.product.name)}>
                <span>{item.product.name}</span>
                <Badge tone={item.status === 'matched' ? 'success' : item.status === 'needs_review' ? 'warning' : 'neutral'}>{Math.round(item.score * 100)}% · {item.method}</Badge>
              </button>
            ))}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={busy}
        title="Удалить установку?"
        message={`Запись «${confirm?.name}» на ПК ${confirm?.computer_id} будет удалена без возможности восстановления из UI.`}
      />
    </>
  );
}
