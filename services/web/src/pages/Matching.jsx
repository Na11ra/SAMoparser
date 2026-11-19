import { useMemo, useState } from 'react';
import { GitCompareArrows, Search, Sparkles } from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { useMutation } from '../app/useMutation';
import { groupUnknown } from '../lib/analytics';
import { formatNumber } from '../lib/format';
import { PROCESS_ALIASES, normalizeName, suggestMatches } from '../lib/matching';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Note,
  PageHeader,
  Pagination,
  ProgressLine,
  SkeletonRows,
  StatCard,
} from '../components/ui';

const PAGE_SIZE = 8;

export default function Matching() {
  const { api, catalog, installations, refresh } = useAppData();
  const { busy, run } = useMutation();
  const [query, setQuery] = useState('');
  const [onlySuggested, setOnlySuggested] = useState(false);
  const [page, setPage] = useState(0);
  const [choices, setChoices] = useState({});

  const groups = useMemo(() => groupUnknown(installations.rows || []), [installations.rows]);

  // Дешёвый предфильтр для 4+ тыс. «грязных» имён: дорогой скоринг считаем
  // только для 8 строк видимой страницы, иначе первый рендер блокируется.
  const catalogKeys = useMemo(
    () => (catalog.data || []).map((item) => normalizeName(item.name)).filter(Boolean),
    [catalog.data],
  );
  const hasHint = useMemo(() => {
    const aliasKeys = new Set(Object.keys(PROCESS_ALIASES).map((key) => key.toLowerCase()));
    return (rawName) => {
      const key = normalizeName(rawName);
      if (!key) return false;
      if (aliasKeys.has(rawName.toLowerCase().trim())) return true;
      const tokens = new Set(key.split(' '));
      return catalogKeys.some((candidate) => {
        if (candidate === key || candidate.includes(key) || key.includes(candidate)) return true;
        return candidate.split(' ').some((token) => tokens.has(token));
      });
    };
  }, [catalogKeys]);

  const hintCount = useMemo(
    () => groups.reduce((sum, group) => sum + (hasHint(group.rawName) ? 1 : 0), 0),
    [groups, hasHint],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups.filter((group) => {
      if (onlySuggested && !hasHint(group.rawName)) return false;
      if (needle && !`${group.rawName} ${group.publisher}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [groups, query, onlySuggested, hasHint]);

  const visible = useMemo(
    () => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((group) => {
      const suggestions = suggestMatches(group.rawName, catalog.data || [], 3);
      return { ...group, suggestions, top: suggestions[0] || null };
    }),
    [filtered, page, catalog.data],
  );

  function chosenName(group) {
    return choices[group.rawName] || (group.top?.score >= 0.55 ? group.top.product.name : catalog.data?.[0]?.name || '');
  }

  async function resolve(group) {
    const name = chosenName(group);
    if (!name) return;
    await run(() => api.resolveMatch(group.rawName, name), {
      success: (data) => `«${group.rawName}» → «${name}»: обновлено ${formatNumber(data.updated)} установок`,
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Данные"
        title="Проверка сопоставлений"
        description="Очередь «грязных» имён процессов и подтверждение канонического продукта человеком."
        tags={<Badge tone="purple"><Sparkles size={12} /> офлайн-подсказки</Badge>}
      />

      <Note tone="info" icon={Sparkles} title="Human-in-the-loop по ADR-0001">
        Подсказки строятся локально в браузере детерминированным матчером (normalize → alias → токенный/триграммный скоринг), без внешнего LLM и без передачи PII. Пороги: ≥ 0.85 — уверенная рекомендация, 0.55–0.85 — нужна проверка, &lt; 0.55 — кандидатов нет. Каноническое имя меняет только человек через <code>POST /api/v1/review</code>.
      </Note>

      {installations.error ? <Card><ErrorState error={installations.error} onRetry={refresh} /></Card> : null}

      {installations.loading ? (
        <Note tone="info" title="Загружаем очередь проверки">
          <ProgressLine value={installations.loadedPages} max={installations.pages} label={`${installations.loadedPages} / ${installations.pages} стр.`} />
        </Note>
      ) : null}

      <div className="stats-grid">
        <StatCard icon={GitCompareArrows} tone="orange" label="Нераспознанных установок" value={formatNumber(groups.reduce((sum, group) => sum + group.count, 0))} hint="по полному срезу" />
        <StatCard icon={GitCompareArrows} tone="blue" label="Уникальных «грязных» имён" value={formatNumber(groups.length)} hint="группировка по имени из источника" />
        <StatCard icon={Sparkles} tone="teal" label="Имён с вероятным кандидатом" value={formatNumber(hintCount)} hint="быстрый предфильтр, решение за человеком" />
        <StatCard icon={GitCompareArrows} tone="violet" label="Затронуто ПК" value={formatNumber(new Set(groups.flatMap((group) => [...group.hosts])).size)} hint="уникальные computer_id" />
      </div>

      <Card padded={false} title="Очередь ручной проверки" subtitle="Решение применяется ко всем установкам с таким же исходным именем">
        <div className="toolbar">
          <div className="search-input"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Поиск по имени процесса" /></div>
          <label className="checkbox"><input type="checkbox" checked={onlySuggested} onChange={(event) => { setOnlySuggested(event.target.checked); setPage(0); }} /> Только с подсказками</label>
          <span className="muted small">Найдено: {formatNumber(filtered.length)}</span>
        </div>

        {installations.loading ? <SkeletonRows rows={5} /> : visible.length ? (
          <div className="review-list">
            {visible.map((group) => (
              <div className="review-item" key={group.rawName}>
                <div className="review-head">
                  <div>
                    <code className="review-raw">{group.rawName}</code>
                    <small>{group.count} установок · {group.hosts.size} ПК{group.publisher ? ` · ${group.publisher}` : ''}{group.version ? ` · v${group.version}` : ''}</small>
                  </div>
                  <div className="review-actions">
                    <select
                      className="select"
                      value={chosenName(group)}
                      onChange={(event) => setChoices((previous) => ({ ...previous, [group.rawName]: event.target.value }))}
                    >
                      {(catalog.data || []).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                    </select>
                    <Button size="sm" onClick={() => resolve(group)} disabled={busy || !chosenName(group)}>Подтвердить</Button>
                  </div>
                </div>
                <div className="review-suggestions">
                  {group.suggestions.length ? group.suggestions.map((item) => (
                    <button
                      type="button"
                      key={item.product.name}
                      className={`suggestion ${chosenName(group) === item.product.name ? 'suggestion-active' : ''}`}
                      onClick={() => setChoices((previous) => ({ ...previous, [group.rawName]: item.product.name }))}
                    >
                      <span>{item.product.name}</span>
                      <span className="score-track"><i style={{ width: `${item.score * 100}%` }} /></span>
                      <Badge tone={item.status === 'matched' ? 'success' : item.status === 'needs_review' ? 'warning' : 'neutral'}>
                        {Math.round(item.score * 100)}% · {item.method}
                      </Badge>
                    </button>
                  )) : <span className="muted small">Кандидатов с ненулевой оценкой нет — выберите продукт вручную или создайте карточку в каталоге.</span>}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="muted pad">Очередь пуста или не подходит под фильтры.</p>}
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
      </Card>
    </>
  );
}
