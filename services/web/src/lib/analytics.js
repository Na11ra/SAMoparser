/** Агрегаты дашборда поверх данных публичного API (без доступа к БД). */

/**
 * Группировка фактов установки по продукту. Для per_device-баланса ТЗ требует
 * дедупликацию: несколько процессов одного ПО на одном ПК = 1 занятое место.
 */
export function usageByProduct(rows) {
  const map = new Map();
  for (const row of rows || []) {
    // Контракт GET /api/v1/installations: исходное имя приходит в поле `name`
    // (в БД колонка называется raw_name).
    const key = row.canonical_name || row.name;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { name: key, installations: 0, hosts: new Set(), rawNames: new Set() });
    }
    const entry = map.get(key);
    entry.installations += 1;
    if (row.computer_id) entry.hosts.add(row.computer_id);
    if (row.name) entry.rawNames.add(row.name);
  }
  return map;
}

/** Баланс «доступно мест по справочнику vs установлено по факту». */
export function buildBalance(catalog, rows) {
  const usage = usageByProduct(rows);
  const products = catalog || [];
  const usedKeys = new Set();
  const items = products.map((product) => {
    usedKeys.add(product.name);
    const entry = usage.get(product.name);
    const purchased = product.license_count === null || product.license_count === undefined
      ? null
      : Number(product.license_count);
    const used = entry ? entry.hosts.size : 0;
    const installations = entry ? entry.installations : 0;
    return {
      ...product,
      purchased,
      used,
      installations,
      deficit: purchased === null ? null : Math.max(0, used - purchased),
      surplus: purchased === null ? null : Math.max(0, purchased - used),
      known: purchased !== null,
    };
  });
  // ПО, найденное на хостах, но отсутствующее в каталоге (Shadow IT).
  for (const [name, entry] of usage) {
    if (!name || usedKeys.has(name) || !entry.rawNames.size) continue;
    if (products.some((product) => product.name === name)) continue;
    items.push({
      name,
      publisher: '',
      version: '',
      license_type: '',
      policy_status: 'unlisted',
      purchased: null,
      used: entry.hosts.size,
      installations: entry.installations,
      deficit: null,
      surplus: null,
      known: false,
      unlisted: true,
    });
  }
  return items.sort((a, b) => (b.deficit || 0) - (a.deficit || 0) || b.used - a.used);
}

/** Очередь ручной проверки: «грязные» имена, не сопоставленные с каталогом. */
export function groupUnknown(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row.match_status !== 'unknown' || !row.name) continue;
    if (!map.has(row.name)) {
      map.set(row.name, {
        rawName: row.name,
        publisher: row.publisher,
        version: row.version,
        count: 0,
        hosts: new Set(),
      });
    }
    const entry = map.get(row.name);
    entry.count += 1;
    if (row.computer_id) entry.hosts.add(row.computer_id);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.rawName.localeCompare(b.rawName));
}

export function sumBy(items, predicate) {
  return items.reduce((sum, item) => sum + (predicate(item) ? 1 : 0), 0);
}

export function riskStats(risks) {
  const bySeverity = { critical: 0, high: 0, medium: 0 };
  const byType = new Map();
  const groups = new Map();
  for (const risk of risks || []) {
    if (risk.severity in bySeverity) bySeverity[risk.severity] += 1;
    byType.set(risk.risk, (byType.get(risk.risk) || 0) + 1);
    const key = `${risk.risk}|${risk.software}|${risk.reason}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        risk: risk.risk,
        severity: risk.severity,
        software: risk.software,
        reason: risk.reason,
        count: 0,
        hosts: new Set(),
      });
    }
    const group = groups.get(key);
    group.count += 1;
    if (risk.computer_id) group.hosts.add(risk.computer_id);
  }
  return {
    bySeverity,
    byType: [...byType].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    groups: [...groups.values()].sort((a, b) => b.count - a.count),
    total: (risks || []).length,
  };
}

export function matchRate(summary) {
  const total = summary?.installations || 0;
  if (!total) return null;
  return Math.round(((summary?.matched || 0) / total) * 1000) / 10;
}
