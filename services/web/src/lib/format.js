/** Подписи и форматирование значений контракта API. */

const numberFormatter = new Intl.NumberFormat('ru-RU');

export function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? numberFormatter.format(parsed) : String(value);
}

export function formatPercent(value, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits).replace('.', ',')} %`;
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function plural(count, forms) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

/** Значения `license_type` в текущем прототипе API (см. CatalogSoftware). */
export const LICENSE_TYPES = [
  { value: 'free', label: 'Бесплатная' },
  { value: 'paid', label: 'Платная' },
  { value: 'conditional_free', label: 'Условно бесплатная' },
];

/** Значения `policy_status` — разделение софта из ТЗ. */
export const POLICY_STATUSES = [
  { value: 'current', label: 'Актуальный' },
  { value: 'outdated', label: 'Устаревший' },
  { value: 'prohibited', label: 'Запрещённый' },
];

export const MATCH_STATUSES = [
  { value: 'matched', label: 'Сопоставлено' },
  { value: 'unknown', label: 'Не распознано' },
];

export const LICENSE_TYPE_LABELS = Object.fromEntries(LICENSE_TYPES.map((x) => [x.value, x.label]));
export const POLICY_STATUS_LABELS = Object.fromEntries(POLICY_STATUSES.map((x) => [x.value, x.label]));
export const MATCH_STATUS_LABELS = Object.fromEntries(MATCH_STATUSES.map((x) => [x.value, x.label]));

export const RISK_LABELS = {
  prohibited: 'Запрещённое ПО',
  license_shortage: 'Дефицит лицензий',
  outdated: 'Устаревшее ПО',
  unknown: 'ПО вне каталога',
};

export const SEVERITY_LABELS = {
  critical: 'Критический',
  high: 'Высокий',
  medium: 'Средний',
};

export const SEVERITY_TONES = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
};

export function licenseTypeLabel(value) {
  return LICENSE_TYPE_LABELS[value] || value || 'Не указан';
}

export function policyStatusLabel(value) {
  return POLICY_STATUS_LABELS[value] || value || 'Не указан';
}

export function matchStatusLabel(value) {
  return MATCH_STATUS_LABELS[value] || value || '—';
}

export function riskLabel(value) {
  return RISK_LABELS[value] || value || '—';
}

export function severityLabel(value) {
  return SEVERITY_LABELS[value] || value || '—';
}
