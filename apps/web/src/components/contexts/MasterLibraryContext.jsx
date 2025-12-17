import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchMasterLibraryTasks } from '../../services/taskService';
import { clearFilters, loadFilters, saveFilters } from '../../utils/persistence';

const DEFAULT_LIMIT = 20;
const createDefaultFilters = () => ({
  text: '',
  sortBy: 'updated_desc'
});

// eslint-disable-next-line react-refresh/only-export-components
export const MasterLibraryContext = createContext(null);

export function MasterLibraryProvider({ children, userId = null }) {
  const [filtersState, setFiltersState] = useState(createDefaultFilters);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const skipNextSaveRef = useRef(false);

  const storageKey = useMemo(
    () => `sdg.filters.masterlib.${userId ?? 'anon'}`,
    [userId]
  );
  const filters = useMemo(() => ({ ...filtersState }), [filtersState]);
  const from = page * limit;

  // Persist filters ONLY; pagination reset occurs within setFilters to avoid extra fetches.
  useEffect(() => {
    const stored = loadFilters(storageKey);
    if (stored && Object.keys(stored).length > 0) {
      setFiltersState(prev => ({ ...prev, ...stored }));
      setPage(0);
    }
    setHasHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    saveFilters(storageKey, filters);
  }, [filters, storageKey, hasHydrated]);

  // Wrap the setter so filters update and pagination reset are batched in the same render.
  const setFilters = useCallback((updater) => {
    setFiltersState(prev => {
      const nextPartial = typeof updater === 'function' ? updater(prev) : updater;
      const merged = { ...prev, ...nextPartial };
      const didChange = Object.keys(merged).some((key) => merged[key] !== prev[key]);
      if (didChange) {
        setPage(0);
        return merged;
      }
      return prev;
    });
  }, [setPage]);

  const run = useCallback(async (signal) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, count: total } = await fetchMasterLibraryTasks({
        ...filters,
        from,
        limit,
        signal
      });
      setItems(data ?? []);
      setCount(total ?? 0);
    } catch (err) {
      if (err?.name === 'AbortError') {
        return;
      }
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [filters, from, limit]);

  useEffect(() => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    run(controller?.signal);
    return () => {
      controller?.abort();
    };
  }, [run]);

  const resetFilters = useCallback(() => {
    skipNextSaveRef.current = true;
    setFiltersState(createDefaultFilters());
    setPage(0);
    clearFilters(storageKey);
  }, [storageKey]);

  const saveCurrentFilters = useCallback(() => {
    saveFilters(storageKey, filters);
  }, [filters, storageKey]);

  const checkTaskLibraryStatus = useCallback(async (taskId) => {
    if (taskId == null) {
      return false;
    }
    const existing = items.find(item => item?.id === taskId);
    if (existing) {
      return true;
    }
    try {
      const { count: matchCount } = await fetchMasterLibraryTasks({
        from: 0,
        limit: 1,
        taskId
      });
      return (matchCount ?? 0) > 0;
    } catch (_err) {
      return false;
    }
  }, [items]);

  const value = useMemo(() => ({
    filters,
    setFilters,
    items,
    count,
    page,
    setPage,
    limit,
    setLimit,
    isLoading,
    error,
    checkTaskLibraryStatus,
    resetFilters,
    saveCurrentFilters
  }), [filters, setFilters, items, count, page, setPage, limit, setLimit, isLoading, error, checkTaskLibraryStatus, resetFilters, saveCurrentFilters]);

  return (
    <MasterLibraryContext.Provider value={value}>
      {children}
    </MasterLibraryContext.Provider>
  );
}
