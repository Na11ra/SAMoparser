import { useCallback, useState } from 'react';
import { useAppData } from './AppDataContext';
import { describeError, useToast } from '../components/ui';

/** Мутация с единым UX: busy-флаг, toast об успехе/ошибке, обновление всех данных. */
export function useMutation() {
  const { refresh } = useAppData();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action, { success, refresh: shouldRefresh = true } = {}) => {
      setBusy(true);
      try {
        const result = await action();
        if (success) push(typeof success === 'function' ? success(result) : success, 'success');
        if (shouldRefresh) refresh();
        return { ok: true, result };
      } catch (error) {
        push(describeError(error), 'error');
        return { ok: false, error };
      } finally {
        setBusy(false);
      }
    },
    [push, refresh],
  );

  return { busy, run };
}
