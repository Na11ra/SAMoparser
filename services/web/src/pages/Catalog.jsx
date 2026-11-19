import { useMemo, useState } from 'react';
import { Boxes, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { useMutation } from '../app/useMutation';
import { usageByProduct } from '../lib/analytics';
import { LICENSE_TYPES, POLICY_STATUSES, formatNumber, licenseTypeLabel, policyStatusLabel } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Modal,
  Note,
  PageHeader,
  Pagination,
} from '../components/ui';

const PAGE_SIZE = 12;
const EMPTY_FORM = {
  name: '', publisher: '', version: '',
  license_type: 'free', policy_status: 'current', license_count: '',
};

export default function Catalog() {
  const { api, catalog, installations, refresh } = useAppData();
  const { busy, run } = useMutation();
  const [query, setQuery] = useState('');
  const [licenseType, setLicenseType] = useState('');
  const [policyStatus, setPolicyStatus] = useState('');
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirm, setConfirm] = useState(null);

  const usage = useMemo(() => usageByProduct(installations.rows || []), [installations.rows]);
  const products = catalog.data || [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (needle && !`${product.name} ${product.publisher} ${product.version}`.toLowerCase().includes(needle)) return false;
      if (licenseType && product.license_type !== licenseType) return false;
      if (policyStatus && product.policy_status !== policyStatus) return false;
      return true;
    });
  }, [products, query, licenseType, policyStatus]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModal(true);
  }

  function openEdit(product) {
    setEditing(product);
    setForm({
      name: product.name,
      publisher: product.publisher || '',
      version: product.version || '',
      license_type: product.license_type || 'free',
      policy_status: product.policy_status || 'current',
      license_count: product.license_count === null || product.license_count === undefined ? '' : String(product.license_count),
    });
    setModal(true);
  }

  function update(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      publisher: form.publisher.trim(),
      version: form.version.trim(),
      license_type: form.license_type,
      policy_status: form.policy_status,
      license_count: form.license_count === '' ? null : Number(form.license_count),
    };
    const result = await run(() => api.saveCatalogItem(payload), {
      success: editing ? 'Карточка ПО обновлена' : 'ПО добавлено в каталог',
    });
    if (result.ok) setModal(false);
  }

  async function remove() {
    if (!confirm) return;
    const result = await run(() => api.deleteCatalogItem(confirm.name), {
      success: `«${confirm.name}» удалено из каталога`,
    });
    if (result.ok) setConfirm(null);
  }

  const columns = [
    { key: 'name', title: 'Наименование / версия', render: (row) => (
      <div className="product-cell">
        <div className="product-icon">{(row.name || '?').slice(0, 1).toUpperCase()}</div>
        <div><b className="cell-strong">{row.name}</b><small>{[row.publisher, row.version].filter(Boolean).join(' · ') || 'Издатель не указан'}</small></div>
      </div>
    ) },
    { key: 'license_type', title: 'Тип лицензии', render: (row) => <Badge tone={row.license_type === 'paid' ? 'purple' : row.license_type === 'conditional_free' ? 'warning' : 'info'}>{licenseTypeLabel(row.license_type)}</Badge> },
    { key: 'policy_status', title: 'Статус политики', render: (row) => (
      <Badge tone={row.policy_status === 'prohibited' ? 'danger' : row.policy_status === 'outdated' ? 'warning' : 'success'}>
        {policyStatusLabel(row.policy_status)}
      </Badge>
    ) },
    { key: 'license_count', title: 'Мест', align: 'right', render: (row) => row.license_count === null || row.license_count === undefined ? <span className="muted">неизв.</span> : formatNumber(row.license_count) },
    { key: 'used', title: 'Установок (ПК)', align: 'right', render: (row) => formatNumber(usage.get(row.name)?.hosts.size || 0) },
    { key: 'actions', title: '', align: 'right', render: (row) => (
      <div className="row-actions">
        <button type="button" className="icon-btn" title="Редактировать" onClick={() => openEdit(row)}><Pencil size={15} /></button>
        <button type="button" className="icon-btn icon-btn-danger" title="Удалить" onClick={() => setConfirm(row)}><Trash2 size={15} /></button>
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Справочники"
        title="Каталог разрешённого ПО"
        description="Эталонные карточки продуктов: типы лицензий, статусы политики и доступные места."
        actions={<Button icon={Plus} onClick={openCreate}>Добавить ПО</Button>}
      />

      <Note tone="info" title="Ручное ведение справочника">
        API <code>POST /api/v1/catalog</code> выполняет upsert по нормализованному имени. При удалении карточки связанные установки становятся «не распознанными», но сами факты не удаляются. Изменение наименования создаёт новую карточку — переименуйте её через удаление и повторное создание.
      </Note>

      {catalog.error ? <Card><ErrorState error={catalog.error} onRetry={refresh} title="Не удалось загрузить каталог" /></Card> : null}

      <Card padded={false} title="Позиции каталога" subtitle={`${formatNumber(filtered.length)} из ${formatNumber(products.length)} карточек`} action={<Boxes size={18} className="muted" />}>
        <div className="toolbar">
          <div className="search-input"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Поиск по названию, издателю, версии" /></div>
          <select className="select" value={licenseType} onChange={(event) => { setLicenseType(event.target.value); setPage(0); }}>
            <option value="">Тип лицензии: все</option>
            {LICENSE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select className="select" value={policyStatus} onChange={(event) => { setPolicyStatus(event.target.value); setPage(0); }}>
            <option value="">Статус: все</option>
            {POLICY_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>

        <DataTable
          columns={columns}
          rows={filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)}
          empty={<p className="muted pad">Каталог пуст или не подходит под фильтры. Добавьте первую карточку ПО.</p>}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Редактировать карточку ПО' : 'Новое ПО в каталоге'}
        description="Поля соответствуют контракту CatalogSoftware backend."
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Отмена</Button><Button onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Сохраняем…' : editing ? 'Сохранить' : 'Добавить'}</Button></>}
      >
        <div className="form-grid">
          <Field label="Каноническое наименование" required hint={editing ? 'Не меняйте название при редактировании: upsert привязан к нормализованному имени.' : 'Например: Microsoft Office LTSC 2021'}>
            <input className="input" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Название продукта" />
          </Field>
          <Field label="Издатель / разработчик"><input className="input" value={form.publisher} onChange={(event) => update('publisher', event.target.value)} placeholder="Microsoft" /></Field>
          <Field label="Версия"><input className="input" value={form.version} onChange={(event) => update('version', event.target.value)} placeholder="2021" /></Field>
          <Field label="Тип лицензии">
            <select className="select" value={form.license_type} onChange={(event) => update('license_type', event.target.value)}>
              {LICENSE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Статус политики" hint="Актуальный / Устаревший / Запрещённый — разделение из ТЗ.">
            <select className="select" value={form.policy_status} onChange={(event) => update('policy_status', event.target.value)}>
              {POLICY_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Доступно мест" hint="Оставьте пустым, если количество неизвестно (null), а не равно нулю.">
            <input className="input" type="number" min="0" value={form.license_count} onChange={(event) => update('license_count', event.target.value)} placeholder="неизвестно" />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={busy}
        title="Удалить ПО из каталога?"
        message={`«${confirm?.name}» будет удалено. Все связанные установки получат статус «Не распознано».`}
      />
    </>
  );
}
