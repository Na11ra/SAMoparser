import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Search,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { buildBalance } from '../lib/analytics';
import { downloadCsv } from '../lib/download';
import {
  formatNumber,
  licenseTypeLabel,
  policyStatusLabel,
} from '../lib/format';
import {
  Badge,
  Button,
  Card,
  DataTable,
  ErrorState,
  Field,
  LoadingState,
  Note,
  PageHeader,
  Pagination,
  ProgressLine,
  StatCard,
} from '../components/ui';

const PAGE_SIZE = 15;

export default function Compliance() {
  const { catalog, installations, refresh } = useAppData();
  const [query, setQuery] = useState('');
  const [onlyDeficit, setOnlyDeficit] = useState(false);
  const [onlyKnown, setOnlyKnown] = useState(false);
  const [page, setPage] = useState(0);

  const balance = useMemo(
    () => buildBalance(catalog.data || [], installations.rows || []),
    [catalog.data, installations.rows],
  );

  const known = balance.filter((item) => item.known);
  const deficits = known.filter((item) => item.deficit > 0);
  const totalDeficit = deficits.reduce((sum, item) => sum + item.deficit, 0);
  const totalSurplus = known.reduce((sum, item) => sum + item.surplus, 0);
  const worst = deficits[0];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return balance.filter((item) => {
      if (onlyDeficit && !(item.deficit > 0)) return false;
      if (onlyKnown && !item.known) return false;
      if (needle && !`${item.name} ${item.publisher}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [balance, query, onlyDeficit, onlyKnown]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function exportCsv() {
    downloadCsv('compliance-balance.csv', [
      { key: 'name', title: 'Продукт' },
      { key: 'publisher', title: 'Издатель' },
      { key: 'license_type', title: 'Тип лицензии' },
      { key: 'policy_status', title: 'Статус политики' },
      { key: 'purchased', title: 'Доступно мест' },
      { key: 'used', title: 'Установлено (уникальных ПК)' },
      { key: 'surplus', title: 'Свободно' },
      { key: 'deficit', title: 'Дефицит' },
    ], filtered.map((item) => ({
      name: item.name,
      publisher: item.publisher,
      license_type: licenseTypeLabel(item.license_type),
      policy_status: item.unlisted ? 'Вне каталога' : policyStatusLabel(item.policy_status),
      purchased: item.purchased ?? 'неизвестно',
      used: item.used,
      surplus: item.surplus ?? 'неизвестно',
      deficit: item.deficit ?? 'неизвестно',
    })));
  }

  const error = catalog.error || installations.error;

  return (
    <>
      <PageHeader
        eyebrow="Мониторинг"
        title="Комплаенс-контроль"
        description="Баланс «куплено лицензий vs установлено по факту» и подсветка критических зон."
        tags={<Badge tone="warning">Ключевой экран MVP</Badge>}
        actions={<Button variant="outline" icon={Download} onClick={exportCsv} disabled={!filtered.length}>Выгрузить CSV</Button>}
      />

      <Note tone="warning" icon={AlertTriangle} title="Источник данных не является реестром закупок">
        Excel кейса не содержит подтверждённых количеств мест, цен и сроков. Колонка «Доступно мест» — справочное поле <code>license_count</code> каталога (legacy), <code>null</code> = «неизвестно». Денежная оценка штрафного риска не рассчитывается (ADR-0001).
      </Note>

      {error ? <Card><ErrorState error={error} onRetry={refresh} /></Card> : null}

      {worst && !installations.loading ? (
        <div className="alert-banner">
          <div className="alert-banner-icon"><AlertTriangle size={22} /></div>
          <div>
            <b>Штрафной риск: {worst.name} установлен на {formatNumber(worst.used)} ПК при доступных {formatNumber(worst.purchased)} местах</b>
            <p>Превышение — {formatNumber(worst.deficit)} мест. Требуется проверка закупок и ручное подтверждение данных.</p>
          </div>
          <Badge tone="danger">КРИТИЧЕСКАЯ ЗОНА</Badge>
        </div>
      ) : null}

      <div className="stats-grid">
        <StatCard icon={ShieldCheck} tone="blue" label="Продуктов с известными местами" value={formatNumber(known.length)} hint={`всего позиций: ${formatNumber(balance.length)}`} />
        <StatCard icon={TrendingDown} tone="red" label="Суммарный дефицит мест" value={formatNumber(totalDeficit)} hint={`продуктов с превышением: ${formatNumber(deficits.length)}`} />
        <StatCard icon={ShieldCheck} tone="teal" label="Свободные места" value={formatNumber(totalSurplus)} hint="можно перераспределить" />
        <StatCard icon={AlertTriangle} tone="orange" label="Данных о квотах нет" value={formatNumber(balance.length - known.length)} hint="null — не ноль, а неизвестно" />
      </div>

      {installations.loading ? (
        <Note tone="info" title="Считаем баланс по всем страницам установок">
          <ProgressLine value={installations.loadedPages} max={installations.pages} label={`${installations.loadedPages} / ${installations.pages} стр.`} />
        </Note>
      ) : null}

      <Card
        title="Баланс лицензий по продуктам"
        subtitle="Установлено = число уникальных компьютеров (дедупликация процессов на одном ПК)"
        padded={false}
        action={<span className="muted small">Найдено: {formatNumber(filtered.length)}</span>}
      >
        <div className="toolbar">
          <div className="search-input">
            <Search size={15} />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Поиск по продукту или издателю" />
          </div>
          <label className="checkbox"><input type="checkbox" checked={onlyDeficit} onChange={(event) => { setOnlyDeficit(event.target.checked); setPage(0); }} /> Только дефицит</label>
          <label className="checkbox"><input type="checkbox" checked={onlyKnown} onChange={(event) => { setOnlyKnown(event.target.checked); setPage(0); }} /> Только с известными местами</label>
        </div>

        {installations.loading && !balance.length ? <LoadingState label="Загружаем срез установок…" /> : (
          <DataTable
            columns={[
              { key: 'name', title: 'Программное обеспечение', render: (row) => (
                <div className="product-cell"><div className="product-icon">{(row.name || '?').slice(0, 1).toUpperCase()}</div><div><b className="cell-strong">{row.name}</b><small>{row.publisher || row.version || '—'}</small></div></div>
              ) },
              { key: 'license_type', title: 'Лицензия', render: (row) => row.unlisted ? <Badge tone="purple">Вне каталога</Badge> : licenseTypeLabel(row.license_type) },
              { key: 'policy_status', title: 'Статус', render: (row) => row.policy_status === 'prohibited' ? <Badge tone="danger">Запрещён</Badge> : row.policy_status === 'outdated' ? <Badge tone="warning">Устарел</Badge> : row.unlisted ? '—' : <Badge tone="success">Актуален</Badge> },
              { key: 'purchased', title: 'Доступно', align: 'right', render: (row) => row.known ? formatNumber(row.purchased) : <span className="muted">неизв.</span> },
              { key: 'used', title: 'Установлено (ПК)', align: 'right', render: (row) => formatNumber(row.used) },
              { key: 'surplus', title: 'Свободно', align: 'right', render: (row) => row.known ? formatNumber(row.surplus) : '—' },
              { key: 'deficit', title: 'Дефицит', align: 'right', render: (row) => row.deficit > 0 ? <b className="text-danger">{formatNumber(row.deficit)}</b> : row.known ? '0' : '—' },
              { key: 'state', title: 'Состояние', render: (row) => row.deficit > 0 ? <Badge tone="danger">Дефицит лицензий</Badge> : !row.known ? <Badge tone="neutral">Нет данных о квоте</Badge> : row.surplus > 0 ? <Badge tone="success">Есть свободные</Badge> : <Badge tone="info">Баланс</Badge> },
            ]}
            rows={pageRows}
            empty={<p className="muted pad">По выбранным фильтрам ничего не найдено.</p>}
          />
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
      </Card>

      <Field label="Методика расчёта" hint="Соответствует обязательной части ТЗ (MVP)">
        <p className="muted small">
          Занятые места считаются по числу уникальных <code>computer_id</code> для каждого продукта: несколько процессов одного ПО на одной рабочей станции дают 1 место.
          Дефицит = max(0, установлено − доступно). При <code>null</code> результат не вычисляется, а не принимается за ноль.
        </p>
      </Field>
    </>
  );
}
