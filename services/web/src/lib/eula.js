/**
 * Офлайн-эвристический разбор текста лицензионного соглашения.
 *
 * Это НЕ LLM и НЕ юридическое заключение: ADR-0001 фиксирует, что в источниках
 * кейса нет текстов EULA, а внешний ИИ по умолчанию отключён. Модуль ищет
 * ключевые формулировки локально в браузере и помечает результат как
 * «требует проверки юристом». Никакие данные не покидают контур приложения.
 */

const RULES = [
  {
    id: 'commercial',
    title: 'Коммерческое использование в корпоративной среде',
    severity: 'high',
    patterns: [
      /non[- ]commercial/i,
      /personal use only/i,
      /not (?:permitted|allowed) for (?:any )?commercial/i,
      /только для личн(?:ых|ого)/i,
      /запрещ(?:ается|ено).{0,60}коммерчес/i,
      /не допускается.{0,60}коммерчес/i,
    ],
    found: 'Найдено ограничение коммерческого использования — высокая вероятность нарушения в корпоративной сети.',
    clear: 'Явного запрета на коммерческое использование не найдено (требуется проверка полного текста).',
  },
  {
    id: 'copyleft',
    title: 'Copyleft-риск раскрытия исходного кода',
    severity: 'high',
    patterns: [/AGPL/i, /Affero General Public License/i, /GNU General Public License/i, /\bGPLv?[23]\b/i, /source code.{0,60}(?:must|shall) be (?:made )?available/i],
    found: 'Обнаружено упоминание сильного copyleft (GPL/AGPL): при распространении могут появиться обязательства по раскрытию исходного кода.',
    clear: 'Признаков сильного вирусного copyleft не найдено.',
  },
  {
    id: 'subscription',
    title: 'Скрытые подписки, автопродление и платные опции',
    severity: 'medium',
    patterns: [/auto[- ]?renew/i, /automatic(?:ally)? renew/i, /recurring (?:fee|payment|billing)/i, /автопродлен/i, /автоматическ(?:ое|ой).{0,30}продлен/i, /подписк/i],
    found: 'Есть формулировки о подписке/автопродлении — проверьте сроки, стоимость и порядок отказа.',
    clear: 'Упоминаний подписки и автопродления не найдено.',
  },
  {
    id: 'telemetry',
    title: 'Передача телеметрии и данных за пределы контура',
    severity: 'medium',
    patterns: [/telemetry/i, /collect.{0,40}(?:usage )?data/i, /third[- ]part(?:y|ies)/i, /передач[аи].{0,40}данн/i, /телеметри/i, /обезличенн(?:ые|ых) данн/i],
    found: 'В тексте есть условия сбора или передачи данных — проверьте, не уходят ли данные за пределы компании без TLS и согласования.',
    clear: 'Явных условий передачи телеметрии не найдено.',
  },
  {
    id: 'trial',
    title: 'Ограниченный срок / пробный период',
    severity: 'medium',
    patterns: [/trial/i, /evaluation (?:period|license)/i, /\b\d{1,3}[- ]day\b/i, /пробн(?:ый|ого) период/i, /ознакомительн/i],
    found: 'Похоже на trial/evaluation-лицензию: проверьте, не истёк ли срок и допускается ли промышленная эксплуатация.',
    clear: 'Ограничений пробного периода не найдено.',
  },
];

function findQuote(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 90);
      const end = Math.min(text.length, match.index + match[0].length + 120);
      return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
    }
  }
  return null;
}

export function analyzeEula(rawText) {
  const text = String(rawText || '').trim();
  if (text.length < 40) {
    return { tooShort: true, findings: [], level: 'unknown', memo: [] };
  }
  const rules = RULES.map((rule) => {
    const quote = findQuote(text, rule.patterns);
    return {
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      detected: Boolean(quote),
      quote,
      comment: quote ? rule.found : rule.clear,
    };
  });
  const detected = rules.filter((rule) => rule.detected);
  const level = detected.some((rule) => rule.severity === 'high') ? 'high' : detected.length >= 2 ? 'medium' : 'low';
  const memo = [
    'Результат получен локальными ключевыми формулировками, а не внешней моделью.',
    'Это не юридическое заключение: решение принимает ответственный сотрудник после проверки полного текста.',
    'Сверьте условия с внутренней политикой компании и реестром закупок.',
    'При выявлении ограничений сохраните цитату и источник соглашения в карточке ПО.',
  ];
  return { tooShort: false, findings: rules, level, memo, textLength: text.length };
}
