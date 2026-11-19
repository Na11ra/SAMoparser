import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, KeyRound, Pencil, Plus } from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { useMutation } from '../app/useMutation';
import { buildBalance } from '../lib/analytics';
import { formatNumber, licenseTypeLabel } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  DataTable,
  ErrorState,
  Field,
  Modal,
  Note,
  PageHeader,
  StatCard,
} from '../components/ui';

export default function Licenses() {
  const { api, catalog, installations, refresh } = useAppData();
  const { busy, run } = useMutation();
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState('');
  const [count, setCount] = useState('');
  const [unlimitedHint, setUnlimitedHint] = useState(false);

  const balance = useMemo(
    () => buildBalance(catalog.data || [], installations.rows || []).filter((item) => !item.unlisted),
    [catalog.data, installations.rows],
  );
  const known = balance.filter((item) => item.known);
  const unknown = balance.filter((item) => !item.known);
  const totalPlaces = known.reduce((sum, item) => sum + item.purchased, 0);
  const totalUsed = known.reduce((sum, item) => sum + item.used, 0);
  const totalDeficit = known.reduce((sum, item) => sum + item.deficit, 0);

  function openQuota(productName = '') {
    setSelected(productName || catalog.data?.[0]?.name || '');
    const product = catalog.data?.find((item) => item.name === (productName || catalog.data?.[0]?.name));
    setCount(product?.license_count === null || product?.license_count === undefined ? '' : String(product.license_count));
    setUnlimitedHint(false);
    setModal(true);
  }

  async function saveQuota() {
    const product = catalog.data?.find((item) => item.name === selected);
    if (!product) return;
    const payload = {
      name: product.name,
      publisher: product.publisher || '',
      version: product.version || '',
      license_type: product.license_type || 'free',
      policy_status: product.policy_status || 'current',
      license_count: count === '' ? null : Math.max(0, Number(count)),
    };
    const result = await run(() => api.saveCatalogItem(payload), { success: `Квота для «${product.name}» сохранена` });
    if (result.ok) setModal(false);
  }

  return (
    <>
      <PageHeader
        eyebrow="Справочники"
        title="Лицензии и квоты"
        description="Доступные места по продуктам и контроль остатка."
        actions={<Button icon={Plus} onClick={() => openQuota()} disabled={!catalog.data?.length}>Изменить квоту</Button>}
      />

      <Note tone="warning" title="В API прототипа нет реестра договоров">
        Backend хранит только справочное поле <code>license_count</code> карточки ПО. Отдельные соглашения, договоры закупок, цены, сроки действия и метрики лицензирования появятся в следующих фазах (см. ADR-0001 и docs/implementation-plan.md). <code>null</code> означает «неизвестно», а не «0 лицензий». Стоимостные риски здесь не рассчитываются.
      </Note>

      {catalog.error ? <Card><ErrorState error={catalog.error} onRetry={refresh} /></Card> : null}

      <div className="stats-grid">
        <StatCard icon={KeyRound} tone="blue" label="Продуктов с квотой" value={formatNumber(known.length)} hint={`всего в каталоге: ${formatNumber(balance.length)}`} />
        <StatCard icon={KeyRound} tone="violet" label="Доступно мест" value={formatNumber(totalPlaces)} hint="сумма известных квот" />
        <StatCard icon={KeyRound} tone="teal" label="Занято уникальных ПК" value={formatNumber(totalUsed)} hint="дедупликация по computer_id" />
        <StatCard icon={KeyRound} tone="red" label="Дефицит мест" value={formatNumber(totalDeficit)} hint="только по известным квотам" />
      </div>

      <Card padded={false} title="Реестр доступных мест" subtitle="Изменение квоты выполняется через upsert карточки каталога" action={<Link className="link" to="/compliance">Комплаенс-контроль <ArrowRight size={13} /></Link>}>
        <DataTable
          columns={[
            { key: 'name', title: 'Продукт / соглашение', render: (row) => <div><b className="cell-strong">{row.name}</b><small>{licenseTypeLabel(row.license_type)}</small></div> },
            { key: 'purchased', title: 'Доступно', align: 'right', render: (row) => formatNumber(row.purchased) },
            { key: 'used', title: 'Установлено (ПК)', align: 'right', render: (row) => formatNumber(row.used) },
            { key: 'surplus', title: 'Свободно', align: 'right', render: (row) => formatNumber(row.surplus) },
            { key: 'deficit', title: 'Дефицит', align: 'right', render: (row) => row.deficit > 0 ? <b className="text-danger">{formatNumber(row.deficit)}</b> : '0' },
            { key: 'state', title: 'Состояние', render: (row) => row.deficit > 0 ? <Badge tone="danger">Дефицит</Badge> : row.surplus > 0 ? <Badge tone="success">Есть запас</Badge> : <Badge tone="info">Баланс</Badge> },
            { key: 'actions', title: '', align: 'right', render: (row) => (
              <button type="button" className="icon-btn" title="Изменить квоту" onClick={() => openQuota(row.name)}><Pencil size={15} /></button>
            ) },
          ]}
          rows={known}
          empty={<p className="muted pad">Нет продуктов с известным количеством мест. Установите первую квоту вручную.</p>}
        />
      </Card>

      <Card title="Квоты не заданы" subtitle={`${formatNumber(unknown.length)} продуктов: расчёт баланса невозможен, пока количество мест не подтверждено`}>
        {unknown.length ? (
          <div className="chip-list">
            {unknown.slice(0, 60).map((item) => (
              <button type="button" key={item.name} className="chip" onClick={() => openQuota(item.name)}>{item.name} <span>неизв.</span></button>
            ))}
          </div>
        ) : <p className="muted">Все карточки каталога содержат известное количество мест.</p>}
        {unknown.length > 60 ? <p className="muted small">Показаны первые 60 из {formatNumber(unknown.length)}.</p> : null}
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Количество доступных мест"
        description="Справочное значение карточки ПО (не подтверждённый договор закупки)."
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Отмена</Button><Button onClick={saveQuota} disabled={busy || !selected}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button></>}
      >
        <div className="form-grid">
          <Field label="Продукт" required>
            <select className="select" value={selected} onChange={(event) => {
              setSelected(event.target.value);
              const product = catalog.data?.find((item) => item.name === event.target.value);
              setCount(product?.license_count === null || product?.license_count === undefined ? '' : String(product.license_count));
            }}>
              {(catalog.data || []).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </Field>
          <Field label="Доступно мест" hint="Пустое значение = null («неизвестно»). Для безлимитного свободного ПО квоту можно не задавать.">
            <input className="input" type="number" min="0" value={count} onChange={(event) => { setCount(event.target.value); setUnlimitedHint(event.target.value === ''); }} placeholder="неизвестно" />
          </Field>
        </div>
        {unlimitedHint ? <Note tone="info">Квота будет очищена: баланс по продукту перестанет рассчитываться.</Note> : null}
      </Modal>
    </>
  );
}
