import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Monitor, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { useMutation } from '../app/useMutation';
import { formatNumber } from '../lib/format';
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
  computer_id: '', display_name: '', department: '', user_name: '', operating_system: '',
};

export default function Devices() {
  const { api, devices, installations, refresh } = useAppData();
  const { busy, run } = useMutation();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirm, setConfirm] = useState(null);

  const counts = useMemo(() => {
    const map = new Map();
    for (const row of installations.rows || []) {
      map.set(row.computer_id, (map.get(row.computer_id) || 0) + 1);
    }
    return map;
  }, [installations.rows]);

  const departments = useMemo(
    () => [...new Set((devices.data || []).map((device) => device.department).filter(Boolean))].sort(),
    [devices.data],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (devices.data || []).filter((device) => {
      if (department && device.department !== department) return false;
      if (needle && !`${device.computer_id} ${device.display_name} ${device.user_name} ${device.department}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [devices.data, query, department]);

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setModal(true); }
  function openEdit(device) {
    setEditing(device);
    setForm({
      computer_id: device.computer_id,
      display_name: device.display_name || '',
      department: device.department || '',
      user_name: device.user_name || '',
      operating_system: device.operating_system || '',
    });
    setModal(true);
  }
  function update(key, value) { setForm((previous) => ({ ...previous, [key]: value })); }

  async function save() {
    if (!form.computer_id.trim()) return;
    const result = await run(() => api.saveDevice({
      computer_id: form.computer_id.trim(),
      display_name: form.display_name.trim(),
      department: form.department.trim(),
      user_name: form.user_name.trim(),
      operating_system: form.operating_system.trim(),
    }), { success: editing ? 'Компьютер обновлён' : 'Компьютер зарегистрирован' });
    if (result.ok) setModal(false);
  }

  async function remove() {
    if (!confirm) return;
    const result = await run(() => api.deleteDevice(confirm.computer_id), { success: `Компьютер «${confirm.computer_id}» удалён` });
    if (result.ok) setConfirm(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="Справочники"
        title="Компьютеры и сотрудники"
        description="Парк рабочих станций, закрепление пользователей и подразделений."
        actions={<Button icon={Plus} onClick={openCreate}>Зарегистрировать ПК</Button>}
      />

      <Note tone="info" title="Связь с импортом данных">
        Перед загрузкой CSV/JSON/XLSX компьютер должен быть зарегистрирован: <code>POST /api/v1/import/installations</code> вернёт 422 со списком неизвестных <code>computer_id</code>. Поле <code>user_name</code> хранит закрепление устройства за сотрудником в текущем прототипе.
        <Link className="link" to="/import"> Перейти к импорту <ArrowRight size={13} /></Link>
      </Note>

      {devices.error ? <Card><ErrorState error={devices.error} onRetry={refresh} /></Card> : null}

      <Card padded={false} title="Зарегистрированные рабочие станции" subtitle={`${formatNumber(filtered.length)} из ${formatNumber(devices.data?.length)} устройств`} action={<Monitor size={18} className="muted" />}>
        <div className="toolbar">
          <div className="search-input"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Поиск по ID, имени, сотруднику" /></div>
          <select className="select" value={department} onChange={(event) => { setDepartment(event.target.value); setPage(0); }}>
            <option value="">Подразделение: все</option>
            {departments.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <DataTable
          columns={[
            { key: 'computer_id', title: 'Идентификатор', render: (row) => <b className="cell-strong mono">{row.computer_id}</b> },
            { key: 'display_name', title: 'Имя ПК', render: (row) => row.display_name || '—' },
            { key: 'user_name', title: 'Сотрудник', render: (row) => row.user_name || <span className="muted">не закреплён</span> },
            { key: 'department', title: 'Подразделение', render: (row) => row.department || '—' },
            { key: 'operating_system', title: 'ОС', render: (row) => row.operating_system ? <Badge tone="neutral">{row.operating_system}</Badge> : '—' },
            { key: 'count', title: 'Установок', align: 'right', render: (row) => formatNumber(counts.get(row.computer_id) || 0) },
            { key: 'actions', title: '', align: 'right', render: (row) => (
              <div className="row-actions">
                <button type="button" className="icon-btn" title="Редактировать" onClick={() => openEdit(row)}><Pencil size={15} /></button>
                <button type="button" className="icon-btn icon-btn-danger" title="Удалить" onClick={() => setConfirm(row)}><Trash2 size={15} /></button>
              </div>
            ) },
          ]}
          rows={filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)}
          empty={<p className="muted pad">Компьютеры не зарегистрированы. Добавьте первый ПК перед импортом установок.</p>}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Редактировать компьютер' : 'Регистрация компьютера'}
        description="POST /api/v1/devices создаёт запись или обновляет её по computer_id."
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Отмена</Button><Button onClick={save} disabled={busy || !form.computer_id.trim()}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button></>}
      >
        <div className="form-grid">
          <Field label="ID компьютера" required hint="Серийный номер / COMPUTERS.SERIAL_NUMBER из файла импорта.">
            <input className="input mono" value={form.computer_id} disabled={Boolean(editing)} onChange={(event) => update('computer_id', event.target.value)} placeholder="WS-001" />
          </Field>
          <Field label="Отображаемое имя"><input className="input" value={form.display_name} onChange={(event) => update('display_name', event.target.value)} placeholder="Бухгалтерия-01" /></Field>
          <Field label="Сотрудник"><input className="input" value={form.user_name} onChange={(event) => update('user_name', event.target.value)} placeholder="Иванов А. С." /></Field>
          <Field label="Подразделение"><input className="input" value={form.department} onChange={(event) => update('department', event.target.value)} placeholder="Бюро ИТ-решений" /></Field>
          <Field label="Операционная система"><input className="input" value={form.operating_system} onChange={(event) => update('operating_system', event.target.value)} placeholder="Windows 11 / Альт РС 10" /></Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={busy}
        title="Удалить компьютер?"
        message={`«${confirm?.computer_id}» и связанные с ним факты установки будут удалены (каскадное удаление в БД).`}
      />
    </>
  );
}
