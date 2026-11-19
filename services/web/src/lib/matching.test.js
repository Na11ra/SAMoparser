import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_AUTO_THRESHOLD,
  MATCH_REVIEW_THRESHOLD,
  classifyConfidence,
  normalizeName,
  similarity,
  suggestMatches,
} from './matching.js';

const catalog = [
  { name: 'Google Chrome', license_count: null },
  { name: 'Microsoft Visual Studio 2022', license_count: 100 },
  { name: 'Microsoft Office LTSC 2021', license_count: 100 },
  { name: 'dBeaver Community Edition', license_count: null },
  { name: 'Adobe Photoshop CC', license_count: 15 },
];

test('normalizeName убирает путь, расширение, версии и технические суффиксы', () => {
  assert.equal(normalizeName('C:\\Program Files\\Google\\chrome_setup.exe'), 'chrome');
  assert.equal(normalizeName('dbeaver-ce-26.0-x64.exe'), 'dbeaver ce');
  assert.equal(normalizeName('studio_visual_2022.exe'), 'studio visual');
  assert.equal(normalizeName('WINWORD.EXE'), 'winword');
  assert.equal(normalizeName(''), '');
});

test('similarity даёт 1 для точного совпадения и 0 для пустой строки', () => {
  assert.equal(similarity('chrome.exe', 'Google Chrome'), 1);
  assert.equal(similarity('', 'Google Chrome'), 0);
  assert.ok(similarity('Microsoft Office', 'Microsoft Office LTSC 2021') > MATCH_REVIEW_THRESHOLD);
});

test('пороги разделяют matched / needs_review / unmatched', () => {
  assert.equal(classifyConfidence(0.9), 'matched');
  assert.equal(classifyConfidence(MATCH_AUTO_THRESHOLD), 'matched');
  assert.equal(classifyConfidence(MATCH_REVIEW_THRESHOLD), 'needs_review');
  assert.equal(classifyConfidence(0.3), 'unmatched');
});

test('алиас известного процесса даёт уверенную подсказку из каталога', () => {
  const suggestions = suggestMatches('chrome_setup.exe', catalog, 3);
  assert.ok(suggestions.length > 0);
  assert.equal(suggestions[0].product.name, 'Google Chrome');
  assert.equal(suggestions[0].method, 'alias');
  assert.ok(suggestions[0].score >= MATCH_AUTO_THRESHOLD);
});

test('подсказки отсортированы по убыванию и ограничены limit', () => {
  const suggestions = suggestMatches('studio_visual_2022.exe', catalog, 2);
  assert.equal(suggestions.length, 2);
  assert.ok(suggestions[0].score >= suggestions[1].score);
});

test('для неизвестного имени нет ложных автоматических совпадений', () => {
  const suggestions = suggestMatches('totally-unknown-process.bin', catalog, 3);
  for (const item of suggestions) {
    assert.ok(item.score < MATCH_AUTO_THRESHOLD);
  }
});
