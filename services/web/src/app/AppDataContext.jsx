import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as api from '../api/client';

const PAGE_SIZE = 500;
const MAX_PAGES = 100; // 50 000 записей: защита браузера от бесконечной выгрузки
const CONCURRENCY = 4;

const AppDataContext = createContext(null);

/** Универсальная загрузка ресурса с состояниями loading / error / data. */
export function useAsync(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    Promise.resolve()
      .then(() => fetcherRef.current())
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (active) setState((previous) => ({ ...previous, loading: false, error }));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, reload };
}

/**
 * Полный срез установок для локальной аналитики. Backend не имеет агрегирующих
 * SQL-ручек, поэтому фронтенд читает страницы по 500 записей через публичный
 * контракт {items,total,limit,offset} с ограниченным параллелизмом.
 */
function useInstallationsSnapshot(version) {
  const [state, setState] = useState({
    rows: [],
    total: 0,
    pages: 0,
    loadedPages: 0,
    loading: true,
    error: null,
    truncated: false,
  });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ rows: [], total: 0, pages: 0, loadedPages: 0, loading: true, error: null, truncated: false });

    async function load() {
      try {
        const first = await api.listInstallations({ limit: PAGE_SIZE, offset: 0 });
        if (cancelled) return;
        const totalPages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
        const pages = Math.min(totalPages, MAX_PAGES);
        const truncated = totalPages > MAX_PAGES;
        const buckets = new Array(pages).fill([]);
        buckets[0] = first.items;
        if (pages <= 1) {
          setState({
            rows: first.items,
            total: first.total,
            pages: 1,
            loadedPages: 1,
            loading: false,
            error: null,
            truncated,
          });
          return;
        }
        setState({
          rows: [],
          total: first.total,
          pages,
          loadedPages: 1,
          loading: true,
          error: null,
          truncated,
        });

        let next = 1;
        let completed = 1;
        async function worker() {
          while (!cancelled) {
            const index = next++;
            if (index >= pages) return;
            const page = await api.listInstallations({ limit: PAGE_SIZE, offset: index * PAGE_SIZE });
            if (cancelled) return;
            buckets[index] = page.items;
            completed += 1;
            setState((previous) => ({ ...previous, loadedPages: completed }));
            if (completed === pages) {
              setState((previous) => ({
                ...previous,
                rows: buckets.flat(),
                loading: false,
              }));
            }
          }
        }

        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, Math.max(0, pages - 1)) }, () => worker()),
        );
      } catch (error) {
        if (!cancelled) setState((previous) => ({ ...previous, loading: false, error }));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [version, nonce]);

  return { ...state, reload };
}

export function AppDataProvider({ children }) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const catalog = useAsync(() => api.listCatalog(), [version]);
  const devices = useAsync(() => api.listDevices(), [version]);
  const summary = useAsync(() => api.getDashboardSummary(), [version]);
  const risks = useAsync(() => api.listRisks(), [version]);
  const installations = useInstallationsSnapshot(version);

  const apiHealthy = !summary.error && summary.data !== null;
  const loading = catalog.loading || summary.loading || risks.loading || installations.loading;

  const value = {
    api,
    version,
    catalog,
    devices,
    summary,
    risks,
    installations,
    apiHealthy,
    loading,
    /** Вызвать после любой мутации, чтобы обновить все экраны. */
    refresh,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData должен использоваться внутри AppDataProvider');
  return context;
}
