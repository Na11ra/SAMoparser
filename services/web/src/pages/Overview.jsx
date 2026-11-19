import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  FileWarning,
  HardDrive,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { buildBalance, matchRate, riskStats } from '../lib/analytics';
import { formatNumber, formatPercent, riskLabel, severityLabel } from '../lib/format';
import {
  Badge,
  BarList,
  Button,
  Card,
  DataTable,
  Donut,
  ErrorState,
  Note,
  PageHeader,
  ProgressLine,
  SkeletonRows,
  StatCard,
} from '../components/ui';

export default function Overview() {
  const { summary, risks, catalog, installations, refresh, loading } = useAppData();

  const stats = useMemo(() => riskStats(risks.data || []), [risks.data]);
  const balance = useMemo(
    () => buildBalance(catalog.data || [], installations.rows || []),
    [catalog.data, installations.rows],
  );
  const rate = matchRate(summary.data);
  const knownBalance = balance.filter((item) => item.known);
  const totalDeficit = knownBalance.reduce((sum, item) => sum + item.deficit, 0);
  const deficitProducts = knownBalance.filter((item) => item.deficit > 0);

  const riskBars = stats.byType.slice(0, 5).map((item) => ({
    label: riskLabel(item.type),
    value: item.count,
    display: formatNumber(item.count),
    tone: item.type === 'prohibited' ? 'red' : item.type === 'license_shortage' ? 'orange' : item.type === 'unknown' ? 'blue' : 'yellow',
  }));

  const topGroups = stats.groups.slice(0, 5).map((group) => ({
    ...group,
    hostCount: group.hosts.size,
  }));

  if (summary.error) {
    return (
      <>
        <PageHeader eyebrow="Мониторинг" title="Обзор" description="Сводка по программным активам компании." />
        <Card><ErrorState error={summary.error} onRetry={refresh} /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Мониторинг"
        title="Обзор использования ПО"
        description="Лицензии, фактические установки и нарушения в одном месте."
        tags={<Badge tone="success" dot>Данные из API</Badge>}
        actions={<Button variant="outline" icon={RefreshCw} onClick={refresh} disabled={loading}>Обновить</Button>}
      />

      <div className="stats-grid">
        <StatCard icon={HardDrive} tone="blue" label="Установки ПО" loading={summary.loading}
          value={formatNumber(summary.data?.installations)} hint={`в срезе: ${formatNumber(installations.total)} записей`} />
        <StatCard icon={ShieldCheck} tone="teal" label="Сопоставлено с каталогом" loading={summary.loading}
          value={rate === null ? '—' : formatPercent(rate, 1)} hint={`${formatNumber(summary.data?.matched)} точных совпадений`} />
        <StatCard icon={AlertTriangle} tone="red" label="Критические риски" loading={summary.loading}
          value={formatNumber(summary.data?.critical_risks)} hint={`всего срабатываний: ${formatNumber(stats.total)}`} />
        <StatCard icon={Boxes} tone="violet" label="Позиций в каталоге" loading={summary.loading}
          value={formatNumber(summary.data?.catalog_software)} hint={`не распознано: ${formatNumber(summary.data?.unknown)} установок`} />
      </div>

      {installations.loading ? (
        <Note tone="info" title="Формируем полный срез установок">
          Страницы читаются через /api/v1/installations (по 500 записей). Агрегаты ниже обновятся после загрузки.
          <ProgressLine value={installations.loadedPages} max={installations.pages} label={`${installations.loadedPages} / ${installations.pages} стр.`} />
        </Note>
      ) : null}
      {installations.error ? (
        <Note tone="warning" title="Срез установок загружен частично">
          {installations.error.message} — таблицы баланса могут быть неполными.
        </Note>
      ) : null}
      {installations.truncated ? (
        <Note tone="warning" title="Срез ограничен">Загружено первые 50 000 записей; для полной аналитики нужен серверный агрегат.</Note>
      ) : null}

      <div className="grid-2">
        <Card title="Качество сопоставления" subtitle="Точные совпадения имён с эталонным каталогом" action={<Link className="link" to="/matching">Очередь проверки <ArrowRight size={13} /></Link>}>
          <div className="donut-layout">
            <Donut value={rate ?? 0} label="совпадений" tone="teal" />
            <div className="donut-legend">
              <div><i className="legend-dot legend-teal" /><span>Сопоставлено</span><b>{formatNumber(summary.data?.matched)}</b></div>
              <div><i className="legend-dot legend-gray" /><span>Не распознано</span><b>{formatNumber(summary.data?.unknown)}</b></div>
              <div><i className="legend-dot legend-blue" /><span>Всего установок</span><b>{formatNumber(summary.data?.installations)}</b></div>
              <p>«Грязные» имена процессов подтверждаются человеком через API /review.</p>
            </div>
          </div>
        </Card>

        <Card title="Структура рисков" subtitle="Срабатывания движка правил backend" action={<Link className="link" to="/risks">Все риски <ArrowRight size={13} /></Link>}>
          {risks.loading ? <SkeletonRows rows={4} /> : riskBars.length ? <BarList items={riskBars} /> : <p className="muted">Рисков не обнаружено.</p>}
          <div className="severity-row">
            {['critical', 'high', 'medium'].map((severity) => (
              <div key={severity}><span>{severityLabel(severity)}</span><b>{formatNumber(stats.bySeverity[severity])}</b></div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Требует внимания" subtitle="Группы срабатываний по ПО и причине" action={<Link className="link" to="/compliance">Комплаенс-контроль <ArrowRight size={13} /></Link>}>
          <DataTable
            columns={[
              { key: 'software', title: 'ПО', render: (row) => <b className="cell-strong">{row.software}</b> },
              { key: 'risk', title: 'Риск', render: (row) => <Badge tone={row.severity === 'critical' ? 'danger' : row.severity === 'high' ? 'warning' : 'info'}>{riskLabel(row.risk)}</Badge> },
              { key: 'count', title: 'Установок', align: 'right', render: (row) => formatNumber(row.count) },
              { key: 'hostCount', title: 'ПК', align: 'right', render: (row) => formatNumber(row.hostCount) },
            ]}
            rows={topGroups}
            empty={<p className="muted pad">Нарушений не найдено.</p>}
          />
        </Card>

        <Card title="Баланс лицензий" subtitle="Доступно мест по справочнику vs уникальные ПК" action={<Link className="link" to="/licenses">Квоты <ArrowRight size={13} /></Link>}>
          {installations.loading ? <SkeletonRows rows={4} /> : knownBalance.length ? (
            <DataTable
              columns={[
                { key: 'name', title: 'Продукт', render: (row) => <b className="cell-strong">{row.name}</b> },
                { key: 'purchased', title: 'Мест', align: 'right', render: (row) => formatNumber(row.purchased) },
                { key: 'used', title: 'Установлено', align: 'right', render: (row) => formatNumber(row.used) },
                { key: 'deficit', title: 'Дефицит', align: 'right', render: (row) => row.deficit > 0 ? <span className="text-danger"><b>{formatNumber(row.deficit)}</b></span> : '0' },
              ]}
              rows={[...deficitProducts, ...knownBalance.filter((x) => !x.deficit)].slice(0, 6)}
              empty={<p className="muted pad">Нет продуктов с известным числом мест.</p>}
            />
          ) : (
            <div className="pad">
              <FileWarning size={22} className="muted" />
              <p className="muted">В каталоге нет подтверждённого количества мест. Баланс будет доступен после ручного ввода квот.</p>
            </div>
          )}
          {totalDeficit > 0 ? (
            <div className="inline-alert">
              <AlertTriangle size={16} /> Суммарный дефицит по продуктам с известными местами: <b>{formatNumber(totalDeficit)}</b>.
            </div>
          ) : null}
        </Card>
      </div>

      <Note tone="info" title="Границы честности данных (ADR-0001)">
        Excel кейса не содержит реестра закупок, цен, сроков и метрик лицензирования: <code>null</code> означает «неизвестно». Денежная оценка штрафного риска и «зомби-софт» в этом контуре не вычисляются.
      </Note>
    </>
  );
}
