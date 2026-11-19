/**
 * Клиент публичного REST API SAMoparser (backend :8000).
 *
 * Контракт взят из `services/backend/app/api.py` и `docs/implementation-plan.md`:
 * все бизнес-ручки смонтированы под /api/v1, ошибки приходят в формате FastAPI
 * (`{"detail": "..."}` или `{"detail": {"message": "...", ...}}`).
 *
 * Фронтенд не знает о базе данных и не вызывает ingest :8001 напрямую для
 * бизнес-операций: загрузка файлов идёт через /api/v1/import/installations.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, details = null, code = 'api_error' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

function buildUrl(path, params) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function errorText(payload, status) {
  const detail = payload?.detail ?? payload?.error ?? payload?.message ?? null;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') return detail.message;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || String(item)).join('; ');
  return `Ошибка API (HTTP ${status})`;
}

async function request(path, { method = 'GET', params, body, headers = {}, signal } = {}) {
  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers: {
        ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Не удалось связаться с API. Проверьте, что сервис backend запущен.', {
      code: 'network_error',
    });
  }

  if (response.status === 204) return null;

  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  try {
    payload = contentType.includes('json') ? await response.json() : await response.text();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(errorText(payload, response.status), {
      status: response.status,
      details: payload?.detail ?? null,
      code: response.status === 409 ? 'conflict' : response.status >= 500 ? 'server_error' : 'request_error',
    });
  }
  return payload;
}

/* ---------------------------------------------------------------- Каталог ПО */

export const listCatalog = () => request('/catalog');

/** Upsert по нормализованному имени: POST создаёт карточку или обновляет существующую. */
export const saveCatalogItem = (item) => request('/catalog', { method: 'POST', body: item });

export const deleteCatalogItem = (name) =>
  request(`/catalog/${encodeURIComponent(name)}`, { method: 'DELETE' });

/* --------------------------------------------------------------- Компьютеры */

export const listDevices = () => request('/devices');

/** Upsert по computer_id. */
export const saveDevice = (device) => request('/devices', { method: 'POST', body: device });

export const deleteDevice = (computerId) =>
  request(`/devices/${encodeURIComponent(computerId)}`, { method: 'DELETE' });

/* --------------------------------------------------------------- Установки */

/** Ответ: { items, total, limit, offset }. limit — 1..500. */
export const listInstallations = ({ status, limit = 100, offset = 0, signal } = {}) =>
  request('/installations', { params: { status, limit, offset }, signal });

export const addInstallation = (installation) =>
  request('/installations', { method: 'POST', body: installation });

export const deleteInstallation = (id) => request(`/installations/${id}`, { method: 'DELETE' });

/** multipart/form-data, поле `file`, опциональный заголовок Idempotency-Key. */
export function importInstallations(file, idempotencyKey) {
  const form = new FormData();
  form.append('file', file);
  return request('/import/installations', {
    method: 'POST',
    body: form,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
  });
}

/* ------------------------------------------------ Риски, сводка, проверка */

export const listRisks = () => request('/risks');

export const getDashboardSummary = () => request('/dashboard/summary');

/** Human-in-the-loop: подтвердить «грязное» имя и привязать его к каталогу. */
export const resolveMatch = (softwareName, catalogName) =>
  request('/review', {
    method: 'POST',
    body: { software_name: softwareName, catalog_name: catalogName },
  });
