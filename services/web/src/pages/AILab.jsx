import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, FlaskConical, Scale, Sparkles, Wand2 } from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { analyzeEula } from '../lib/eula';
import { classifyConfidence, normalizeName, suggestMatches } from '../lib/matching';
import { formatNumber } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  Field,
  Note,
  PageHeader,
} from '../components/ui';

const EXAMPLES = [
  'studio_visual_2022.exe',
  'Google_Chrome_v2',
  'chrome_setup.exe',
  'dbeaver-ce-26.0-x64.exe',
  'photoshop_2024_portable.exe',
];

const LEVELS = {
  high: { tone: 'danger', label: 'Высокий риск' },
  medium: { tone: 'warning', label: 'Умеренный риск' },
  low: { tone: 'success', label: 'Низкий риск' },
  unknown: { tone: 'neutral', label: 'Недостаточно текста' },
};

export default function AILab() {
  const { catalog } = useAppData();
  const [tab, setTab] = useState('matching');

  /* Smart Matching sandbox */
  const [rawName, setRawName] = useState('studio_visual_2022.exe');
  const [matchResult, setMatchResult] = useState(null);

  function runMatch(value = rawName) {
    const normalized = normalizeName(value);
    const suggestions = suggestMatches(value, catalog.data || [], 5);
    setMatchResult({ raw: value, normalized, suggestions });
  }

  /* EULA heuristic analyzer */
  const [eulaText, setEulaText] = useState('');
  const [eulaResult, setEulaResult] = useState(null);

  async function readFile(file) {
    if (!file) return;
    const text = await file.text();
    setEulaText(text);
    setEulaResult(null);
  }

  function runEula() {
    setEulaResult(analyzeEula(eulaText));
  }

  const level = LEVELS[eulaResult?.level || 'unknown'];

  return (
    <>
      <PageHeader
        eyebrow="ИИ-сервисы (бонус)"
        title="ИИ-лаборатория"
        description="Дополнительные сценарии ТЗ: умный мэтчинг «грязных» имён и разбор лицензионных соглашений."
        tags={<Badge tone="purple"><Sparkles size={12} /> локальный офлайн-режим</Badge>}
      />

      <Note tone="warning" icon={FlaskConical} title="Честно о реализации">
        Backend прототипа не имеет AI-endpoint’ов, а ADR-0001 прямо откладывает внешний LLM и text-to-SQL до появления read-only/RLS слоя. Здесь работают <b>детерминированные офлайн-эвристики в браузере</b>: они ничего не отправляют во внешние сервисы, не получают PII и выдают только рекомендации. Результаты не являются юридическим заключением.
      </Note>

      <div className="tabs">
        <button type="button" className={tab === 'matching' ? 'tab active' : 'tab'} onClick={() => setTab('matching')}><Wand2 size={16} /> Кейс А · Smart Matching</button>
        <button type="button" className={tab === 'eula' ? 'tab active' : 'tab'} onClick={() => setTab('eula')}><Scale size={16} /> Кейс Б · Анализатор EULA</button>
        <Link className="tab tab-link" to="/matching"><ArrowRight size={16} /> Очередь подтверждения</Link>
      </div>

      {tab === 'matching' ? (
        <div className="grid-2">
          <Card title="Песочница нормализации" subtitle="Любая «грязная» строка → кандидаты из эталонного каталога">
            <Field label="Имя процесса / установки" required hint="Пути ОС, расширения, технические суффиксы и версии очищаются автоматически.">
              <input className="input mono" value={rawName} onChange={(event) => setRawName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && runMatch()} placeholder="studio_visual_2022.exe" />
            </Field>
            <div className="example-row">
              {EXAMPLES.map((example) => <button type="button" key={example} className="chip chip-button" onClick={() => { setRawName(example); runMatch(example); }}>{example}</button>)}
            </div>
            <div className="form-actions">
              <Button icon={Wand2} onClick={() => runMatch()} disabled={!rawName.trim()}>Проверить строку</Button>
              <span className="muted small">Каталог: {formatNumber(catalog.data?.length)} позиций</span>
            </div>

            {matchResult ? (
              <div className="lab-result">
                <div className="lab-kv"><span>Исходная строка</span><code>{matchResult.raw}</code></div>
                <div className="lab-kv"><span>Нормализованный ключ</span><code>{matchResult.normalized || '—'}</code></div>
                <b className="small">Кандидаты (порог auto ≥ 0.85, review ≥ 0.55):</b>
                {matchResult.suggestions.length ? matchResult.suggestions.map((item) => (
                  <div className="lab-candidate" key={item.product.name}>
                    <div><b>{item.product.name}</b><small>{item.product.publisher || 'издатель не указан'}</small></div>
                    <span className="score-track"><i style={{ width: `${item.score * 100}%` }} /></span>
                    <Badge tone={item.status === 'matched' ? 'success' : item.status === 'needs_review' ? 'warning' : 'neutral'}>{Math.round(item.score * 100)}% · {item.method}</Badge>
                  </div>
                )) : <p className="muted small">Подходящих кандидатов не найдено: потребуется ручная привязка или новая карточка в каталоге.</p>}
              </div>
            ) : null}
          </Card>

          <Card title="Как это работает" subtitle="Пайплайн из ADR-0001 и плана backend">
            <ol className="steps">
              <li><b>Нормализация</b> — путь, расширение, технические суффиксы (setup, x64, portable), разделители и версии.</li>
              <li><b>Словарь алиасов</b> — известные процессы (chrome.exe, winword.exe, 1cv8c.exe…) получают уверенность 0.98.</li>
              <li><b>Лексический фолбэк</b> — триграммный коэффициент Dice + пересечение токенов по каталогу, топ-5 кандидатов.</li>
              <li><b>Пороги</b> — {classifyConfidence(0.9)} / {classifyConfidence(0.7)} / {classifyConfidence(0.3)} для 0.9 / 0.7 / 0.3.</li>
              <li><b>Решение человека</b> — подтверждение через /review сохраняет каноническое имя для всех установок с таким raw_name.</li>
            </ol>
            <Note tone="info">Векторный поиск pgvector и LLM-reranker описаны в docs/backend-plan.md (Модуль 7), но в текущем прототипе не реализованы.</Note>
            <Link className="link" to="/matching">Перейти к очереди подтверждения <ArrowRight size={13} /></Link>
          </Card>
        </div>
      ) : (
        <div className="grid-2">
          <Card title="Текст лицензионного соглашения" subtitle=".txt или вставка текста · анализ выполняется локально">
            <div className="file-row">
              <label className="file-picker">
                <FileText size={16} /> Загрузить .txt
                <input type="file" accept=".txt,.md,text/plain" hidden onChange={(event) => readFile(event.target.files?.[0])} />
              </label>
              <span className="muted small">PDF-файлы требуют серверного парсера (pypdf) — в прототипе не реализовано.</span>
            </div>
            <textarea
              className="textarea"
              value={eulaText}
              onChange={(event) => { setEulaText(event.target.value); setEulaResult(null); }}
              placeholder="Вставьте текст EULA: условия коммерческого использования, подписки, copyleft, телеметрия…"
              rows={12}
            />
            <div className="form-actions">
              <Button icon={Scale} onClick={runEula} disabled={!eulaText.trim()}>Проанализировать</Button>
              <span className="muted small">{formatNumber(eulaText.length)} символов</span>
            </div>
          </Card>

          <Card title="Результат разбора" subtitle="Ключевые формулировки и памятка">
            {!eulaResult ? <p className="muted">Вставьте текст и нажмите «Проанализировать».</p> : eulaResult.tooShort ? (
              <Note tone="warning">Слишком мало текста (менее 40 символов) для осмысленного разбора.</Note>
            ) : (
              <>
                <div className="lab-level"><Badge tone={level.tone}>{level.label}</Badge><span>Проверено правил: {eulaResult.findings.length}</span></div>
                <div className="finding-list">
                  {eulaResult.findings.map((finding) => (
                    <div className={`finding ${finding.detected ? `finding-${finding.severity}` : ''}`} key={finding.id}>
                      <div className="finding-head"><b>{finding.title}</b><Badge tone={finding.detected ? finding.severity === 'high' ? 'danger' : 'warning' : 'success'}>{finding.detected ? 'Найдено' : 'Не найдено'}</Badge></div>
                      <p>{finding.comment}</p>
                      {finding.quote ? <blockquote>{finding.quote}</blockquote> : null}
                    </div>
                  ))}
                </div>
                <b className="small">Памятка</b>
                <ul className="bullets">{eulaResult.memo.map((line) => <li key={line}>{line}</li>)}</ul>
                <Note tone="danger" title="Не юридическое заключение">Эвристика может пропустить условие или дать ложное срабатывание. Решение принимает юрист после проверки полного текста соглашения.</Note>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
