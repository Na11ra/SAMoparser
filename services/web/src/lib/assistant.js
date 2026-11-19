/**
 * Локальный офлайн-ассистент ИТ-директора.
 *
 * Сознательно НЕ реализует text-to-SQL и не обращается к внешнему LLM:
 * ADR-0001 откладывает эти сценарии до появления read-only/RLS слоя. Ответы
 * считаются из уже загруженных через публичное API данных и всегда помечаются
 * как требующие проверки человеком.
 */

import { buildBalance, groupUnknown, riskStats, usageByProduct } from './analytics';
import { formatNumber, riskLabel } from './format';

export const SUGGESTIONS = [
  'Какое ПО запрещено?',
  'Где дефицит лицензий?',
  'Сколько установок не распознано?',
  'У кого стоит нелицензионный Photoshop?',
  'Сколько лицензий простаивает?',
  'Покажи сводку по рискам',
];

const DISCLAIMER = 'Ответ сформирован локально по данным публичного API (без внешнего LLM и без SQL-запросов к БД). Проверьте цифры в отчёте перед принятием решения.';

function table(columns, rows) {
  return { columns, rows };
}

function answer(question, { catalog = [], rows = [], risks = [], devices = [], summary = null }) {
  const q = question.toLowerCase();
  const balance = buildBalance(catalog, rows);
  const stats = riskStats(risks);

  if (/простаива|зомби|уволен|не использу/.test(q)) {
    return {
      text: 'Корректно посчитать «зомби-лицензии» сейчас нельзя: в выгрузке кейса нет телеметрии запусков, статусов сотрудников и реестра закупок. Вместо выдуманной оценки доступны факты: '
        + `${formatNumber(summary?.installations)} установок, ${formatNumber(devices.length)} компьютеров, ${formatNumber(balance.filter((x) => x.known && x.surplus > 0).length)} продуктов со свободными местами по справочнику. `
        + 'Для расчёта потребуются данные о последнем запуске (last_used_at) и подтверждённые права (см. ADR-0001).',
      table: table(
        [{ key: 'name', title: 'Продукт' }, { key: 'purchased', title: 'Доступно мест' }, { key: 'used', title: 'Занято ПК' }, { key: 'surplus', title: 'Свободно' }],
        balance.filter((x) => x.known && x.surplus > 0).slice(0, 8).map((x) => ({ name: x.name, purchased: x.purchased, used: x.used, surplus: x.surplus })),
      ),
    };
  }

  if (/запрещ|forbidden|политик/.test(q)) {
    const prohibited = catalog.filter((x) => x.policy_status === 'prohibited');
    const items = risks.filter((x) => x.risk === 'prohibited');
    const hosts = new Set(items.map((x) => x.computer_id));
    return {
      text: prohibited.length
        ? `В каталоге ${formatNumber(prohibited.length)} позиций со статусом «Запрещённый». По факту обнаружено ${formatNumber(items.length)} установок на ${formatNumber(hosts.size)} ПК. Рекомендация: проверить и удалить, решение принимает ответственный сотрудник.`
        : 'В загруженном каталоге нет позиций со статусом «Запрещённый».',
      table: table(
        [{ key: 'software', title: 'ПО' }, { key: 'count', title: 'Установок' }, { key: 'reason', title: 'Причина' }],
        stats.groups.filter((x) => x.risk === 'prohibited').slice(0, 8).map((x) => ({ software: x.software, count: x.count, reason: x.reason })),
      ),
    };
  }

  if (/дефицит|нелицензион|не хватает|превышен/.test(q)) {
    const deficits = balance.filter((x) => x.known && x.deficit > 0);
    if (/photoshop|фотошоп/.test(q)) {
      const target = catalog.find((x) => /photoshop/i.test(x.name));
      if (target) {
        const usage = usageByProduct(rows).get(target.name);
        return {
          text: `По продукту «${target.name}»: доступно мест по справочнику — ${formatNumber(target.license_count)}, зафиксировано ${formatNumber(usage?.hosts.size || 0)} уникальных ПК. `
            + 'Список ниже построен по локальной выгрузке установок; это не юридический вывод о лицензировании.',
          table: table(
            [{ key: 'computer_id', title: 'Компьютер' }, { key: 'name', title: 'Имя из источника' }, { key: 'version', title: 'Версия' }],
            rows.filter((x) => (x.canonical_name || x.name) === target.name).slice(0, 10).map((x) => ({ computer_id: x.computer_id, name: x.name, version: x.version || '—' })),
          ),
        };
      }
      return { text: 'Продукт Photoshop не найден в загруженном каталоге. Проверьте наименование на странице «Каталог ПО».', table: null };
    }
    return {
      text: deficits.length
        ? `Обнаружен ${formatNumber(deficits.length)} продукт(ов) с превышением числа уникальных ПК над доступными местами справочника. Суммарный дефицит — ${formatNumber(deficits.reduce((s, x) => s + x.deficit, 0))} мест. Денежная оценка недоступна: в источнике нет цен и подтверждённых закупок.`
        : 'Превышений по продуктам с известным количеством мест не найдено. Для остальных продуктов количество мест неизвестно (null), поэтому дефицит не вычисляется.',
      table: table(
        [{ key: 'name', title: 'Продукт' }, { key: 'purchased', title: 'Доступно' }, { key: 'used', title: 'Установлено (ПК)' }, { key: 'deficit', title: 'Дефицит' }],
        deficits.slice(0, 8).map((x) => ({ name: x.name, purchased: x.purchased, used: x.used, deficit: x.deficit })),
      ),
    };
  }

  if (/не распозна|неизвестн|unknown|грязн|мэтчинг|сопостав/.test(q)) {
    const unknown = groupUnknown(rows);
    return {
      text: `Не сопоставлено с каталогом: ${formatNumber(summary?.unknown)} установок, ${formatNumber(unknown.length)} уникальных «грязных» имён. Топ имён ниже можно подтвердить в разделе «Проверка сопоставлений» — каноническое имя меняет только человек через API /review.`,
      table: table(
        [{ key: 'name', title: 'Имя из источника' }, { key: 'count', title: 'Установок' }, { key: 'hosts', title: 'ПК' }],
        unknown.slice(0, 8).map((x) => ({ name: x.rawName, count: x.count, hosts: x.hosts.size })),
      ),
    };
  }

  if (/риск|наруш|сводк|итог|сколько/.test(q)) {
    return {
      text: `Сводка по текущим данным: ${formatNumber(summary?.installations)} установок, ${formatNumber(summary?.catalog_software)} позиций каталога, `
        + `${formatNumber(stats.bySeverity.critical)} критических, ${formatNumber(stats.bySeverity.high)} высоких и ${formatNumber(stats.bySeverity.medium)} средних рисков. `
        + 'Риски рассчитаны движком backend, а не моделью.',
      table: table(
        [{ key: 'type', title: 'Класс риска' }, { key: 'count', title: 'Срабатываний' }],
        stats.byType.slice(0, 8).map((x) => ({ type: riskLabel(x.type), count: x.count })),
      ),
    };
  }

  return {
    text: 'Я отвечаю только по загруженным данным каталога, установок и рисков. Попробуйте один из быстрых вопросов ниже — например про запрещённое ПО, дефицит лицензий или нераспознанные имена.',
    table: null,
  };
}

export function answerQuestion(question, data) {
  const result = answer(question, data);
  return { ...result, note: DISCLAIMER, question };
}
