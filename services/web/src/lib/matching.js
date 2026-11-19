/**
 * Локальный детерминированный Smart Matching (офлайн-фолбэк).
 *
 * Важно: это НЕ внешний LLM. ADR-0001 разрешает для локального MVP только
 * offline mock и требует human approval: модуль лишь подсказывает кандидатов
 * из каталога, а каноническое сопоставление меняет человек через
 * POST /api/v1/review. Никакие данные (в том числе PII) никуда не отправляются.
 *
 * Порядок: exact/normalized → alias → токенный/триграммный скоринг → пороги.
 */

export const MATCH_AUTO_THRESHOLD = 0.85;
export const MATCH_REVIEW_THRESHOLD = 0.55;

const TECHNICAL_TOKENS = new Set([
  'setup', 'install', 'installer', 'portable', 'repack', 'x64', 'x86', 'x32',
  'win32', 'win64', 'win', 'linux', 'amd64', '64bit', '32bit', 'bit', 'full',
  'offline', 'silent', 'final', 'release', 'stable', 'beta', 'ru', 'en', 'us',
  'exe', 'msi', 'app', 'bin', 'run', 'launcher', 'update', 'crack', 'patch',
]);

/** Синонимы канонических имён (совпадает со словарём normalize_name в api.py). */
const NAME_ALIASES = {
  'google chrome': 'chrome',
  chrome: 'chrome',
};

/** Известные «грязные» имена процессов → каноническое имя каталога. */
export const PROCESS_ALIASES = {
  'chrome.exe': 'google chrome',
  'google_chrome_v2': 'google chrome',
  'chrome_setup.exe': 'google chrome',
  'chrome_proxy.exe': 'google chrome',
  'winword.exe': 'microsoft office',
  'excel.exe': 'microsoft office',
  'powerpnt.exe': 'microsoft office',
  'outlook.exe': 'microsoft office',
  'office15\\winword.exe': 'microsoft office',
  'photoshop.exe': 'adobe photoshop',
  'photoshop_2024_portable.exe': 'adobe photoshop',
  'studio_visual_2022.exe': 'microsoft visual studio',
  'devenv.exe': 'microsoft visual studio',
  'dbeaver-ce-26.0-x64.exe': 'dbeaver',
  'dbeaver.exe': 'dbeaver',
  '1cv8c.exe': '1с предприятие',
  '1cv8.exe': '1с предприятие',
  'code.exe': 'visual studio code',
  'anydesk.exe': 'anydesk',
  'utorrent.exe': 'utorrent',
  'kmsauto net.exe': 'kmsauto net',
  'winrar.exe': 'winrar',
  'python.exe': 'python',
  'node.exe': 'node.js',
  'gimp.exe': 'gimp',
  'firefox.exe': 'mozilla firefox',
};

/** Привести «грязное» имя процесса к нормализованной строке. */
export function normalizeName(raw) {
  let value = String(raw ?? '').toLowerCase().replace(/\\/g, '/');
  value = value.split('/').pop() || '';
  value = value.replace(/\.(exe|com|msi|bat|cmd|app|bin|sh|jar)$/i, '');
  // Сначала разделители, затем версии/года: в «studio_visual_2022» перед годом
  // стоит «_», который считается частью слова и мешает границе \b.
  value = value.replace(/[_\-.+()[\]]+/g, ' ');
  value = value.replace(/\b(v?\d+(?:\.\d+)*|version\s*\d+|20\d{2}|19\d{2})\b/g, ' ');
  value = value
    .split(/\s+/)
    .filter((token) => token && !TECHNICAL_TOKENS.has(token))
    .join(' ')
    .trim();
  return NAME_ALIASES[value] || value;
}

function bigrams(value) {
  const padded = ` ${value} `;
  const result = new Map();
  for (let i = 0; i < padded.length - 1; i += 1) {
    const gram = padded.slice(i, i + 2);
    result.set(gram, (result.get(gram) || 0) + 1);
  }
  return result;
}

function diceCoefficient(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const [gram, count] of a) intersection += Math.min(count, b.get(gram) || 0);
  return (2 * intersection) / ([...a.values(), ...b.values()].reduce((sum, n) => sum + n, 0));
}

function tokenOverlap(left, right) {
  const a = new Set(left.split(' ').filter(Boolean));
  const b = new Set(right.split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
}

/** Оценка близости двух названий в диапазоне 0..1. */
export function similarity(rawName, catalogName) {
  const left = normalizeName(rawName);
  const right = normalizeName(catalogName);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  const containment = longer.includes(shorter) ? 0.9 * (shorter.length / longer.length) + 0.1 : 0;
  const lexical = 0.65 * diceCoefficient(left, right) + 0.35 * tokenOverlap(left, right);
  return Math.min(1, Math.max(lexical, containment));
}

export function classifyConfidence(score) {
  if (score >= MATCH_AUTO_THRESHOLD) return 'matched';
  if (score >= MATCH_REVIEW_THRESHOLD) return 'needs_review';
  return 'unmatched';
}

/**
 * Подсказки для строки: точный алиас получает confidence 0.98, остальные
 * кандидаты оцениваются детерминированным скорингом. Результат всегда
 * остаётся рекомендацией до подтверждения человеком.
 */
export function suggestMatches(rawName, catalog, limit = 3) {
  const key = String(rawName ?? '').toLowerCase().trim();
  const alias = PROCESS_ALIASES[key];
  const products = Array.isArray(catalog) ? catalog : [];
  const suggestions = products.map((product) => {
    let score = similarity(rawName, product.name);
    const aliasHit = Boolean(alias) && normalizeName(product.name).includes(normalizeName(alias));
    if (aliasHit) score = Math.max(score, 0.98);
    score = Math.round(score * 100) / 100;
    return {
      product,
      score,
      status: classifyConfidence(score),
      method: aliasHit ? 'alias' : score >= MATCH_AUTO_THRESHOLD ? 'normalized' : 'fuzzy',
    };
  });
  return suggestions
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
