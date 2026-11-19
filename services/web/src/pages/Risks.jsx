import { useMemo, useState } from 'react';
import { AlertTriangle, Search, ShieldAlert } from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { riskStats } from '../lib/analytics';
import { RISK_LABELS, SEVERITY_LABELS, formatNumber, riskLabel, severityLabel } from '../lib/format';
import {
  Badge,
  BarList,
  Card,
  DataTable,
  ErrorState,
  Note,
  PageHeader,
  Pagination,
  SkeletonRows,
  StatCard,
} from '../components/ui';

const PAGE_SIZE = 12;

export default function Risks() {
  const { risks, refresh } = useAppData();
  const [severity, setSeverity] = useState('');
  const [riskType, setRiskType] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const stats = useMemo(() => riskStats(risks.data || []), [risks.data]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return stats.groups.filter((group) => {
      if (severity && group.severity !== severity) return false;
      if (riskType && group.risk !== riskType) return false;
      if (needle && !`${group.software} ${group.reason} ${riskLabel(group.risk)}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [stats.groups, severity, riskType, query]);

  const severityTone = (value) => value === 'critical' ? 'danger' : value === 'high' ? 'warning' : 'info';

  return (
    <>
      <PageHeader
        eyebrow="Мониторинг"
        title="Риски комплаенса"
        description="Срабатывания правил движка backend: запрещённое ПО, дефицит мест, устаревшие версии и ПО вне каталога."
        tags={<Badge tone="danger" dot>{formatNumber(stats.total)} срабатываний</Badge>}
      />

      <Note tone="info" title="Откуда берутся риски">
        Список формирует <code>GET /api/v1/risks</code>: правила проверяют <code>policy_status</code> каталога, превышение <code>license_count</code> и отсутствие сопоставления. Денежных оценок и «зомби-лицензий» в прототипе нет — для них нужны цены, сроки и телеметрия запусков.
      </Note>

      {risks.error ? <Card><ErrorState error={risks.error} onRetry={refresh} title="Не удалось загрузить риски" /></Card> : null}

      <div className="stats-grid">
        <StatCard icon={ShieldAlert} tone="red" label="Критические" value={formatNumber(stats.bySeverity.critical)} hint="запрещённое ПО" />
        <StatCard icon={AlertTriangle} tone="orange" label="Высокие" value={formatNumber(stats.bySeverity.high)} hint="дефицит лицензий" />
        <StatCard icon={AlertTriangle} tone="yellow" label="Средние" value={formatNumber(stats.bySeverity.medium)} hint="устаревшие / вне каталога" />
        <StatCard icon={ShieldAlert} tone="blue" label="Групп нарушений" value={formatNumber(stats.groups.length)} hint="уникальные ПО + причина" />
      </div>

      <div className="grid-2">
        <Card title="Распределение по классам" subtitle="Число срабатываний правил">
          {risks.loading ? <SkeletonRows rows={4} /> : <BarList items={stats.byType.map((item) => ({
            label: riskLabel(item.type),
            value: item.count,
            display: formatNumber(item.count),
            tone: item.type === 'prohibited' ? 'red' : item.type === 'license_shortage' ? 'orange' : 'blue',
          }))} />}
        </Card>
        <Card title="Рекомендуемые действия" subtitle="Общие меры реагирования (не юридическое заключение)">
          <ul className="bullets">
            <li><b>Запрещённое ПО</b> — проверить факты установки, инициировать удаление и зафиксировать решение.</li>
            <li><b>Дефицит лицензий</b> — сверить количество мест с реестром закупок перед выводом о нарушении.</li>
            <li><b>Устаревшее ПО</b> — запланировать обновление до минимально допустимой версии.</li>
            <li><b>ПО вне каталога</b> — подтвердить сопоставление в разделе «Проверка имён» или добавить карточку.</li>
          </ul>
        </Card>
      </div>

      <Card padded={false} title="Сгруппированные нарушения" subtitle={`${formatNumber(filtered.length)} групп по ПО и причине`}>
        <div className="toolbar">
          <div className="search-input"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Поиск по ПО или причине" /></div>
          <select className="select" value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(0); }}>
            <option value="">Критичность: все</option>
            {Object.entries(SEVERITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="select" value={riskType} onChange={(event) => { setRiskType(event.target.value); setPage(0); }}>
            <option value="">Класс риска: все</option>
            {Object.entries(RISK_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        <DataTable
          columns={[
            { key: 'severity', title: 'Критичность', render: (row) => <Badge tone={severityTone(row.severity)}>{severityLabel(row.severity)}</Badge> },
            { key: 'risk', title: 'Класс риска', render: (row) => <b className="cell-strong">{riskLabel(row.risk)}</b> },
            { key: 'software', title: 'ПО', render: (row) => row.software },
            { key: 'reason', title: 'Причина', render: (row) => <span className="muted">{row.reason}</span> },
            { key: 'count', title: 'Установок', align: 'right', render: (row) => formatNumber(row.count) },
            { key: 'hosts', title: 'Затронуто ПК', align: 'right', render: (row) => formatNumber(row.hosts.size) },
            { key: 'examples', title: 'Примеры ПК', render: (row) => [...row.hosts].slice(0, 3).map((host) => <code key={host} className="host-chip">{host}</code>) },
          ]}
          rows={filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)}
          empty={<p className="muted pad">Рисков по выбранным фильтрам не найдено.</p>}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
      </Card>
    </>
  );
}
