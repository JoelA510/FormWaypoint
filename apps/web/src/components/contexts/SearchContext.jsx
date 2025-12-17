import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchFilteredTasks } from '../../services/taskService';
import { clearFilters, loadFilters, saveFilters } from '../../utils/persistence';

const DEFAULT_LIMIT = 20;

const createDefaultFilters = () => ({
  text: '',
  status: null,
  taskType: null,
  assigneeId: null,
  projectId: null,
  dateFrom: null,
  dateTo: null,
  includeArchived: false,
  priority: null,
  sortBy: 'updated_desc'
});

// eslint-disable-next-line react-refresh/only-export-components
export const SearchContext = createContext(null);

export function SearchProvider({ children, userId = null }) {
  const [filtersState, setFiltersState] = useState(createDefaultFilters);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [count, setCount] = useState(0);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const skipNextSaveRef = useRef(false);

  const storageKey = useMemo(
    () => `sdg.filters.search.${userId ?? 'anon'}`,
    [userId]
  );
  const filters = useMemo(() => ({ ...filtersState }), [filtersState]);
  const from = page * limit;

  useEffect(() => {
    const stored = loadFilters(storageKey);
    if (stored && Object.keys(stored).length > 0) {
      setFiltersState(prev => ({ ...prev, ...stored }));
      setPage(0);
    }
    setHasHydrated(true);
  }, [storageKey]);

  // Persist filters ONLY; pagination reset occurs within setFilters to avoid extra fetches.
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
      const { data, count: total } = await fetchFilteredTasks({
        ...filters,
        from,
        limit,
        signal
      });
      setResults(data ?? []);
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

  const value = useMemo(() => ({
    filters,
    setFilters,
    results,
    count,
    page,
    setPage,
    limit,
    setLimit,
    isLoading,
    error,
    resetFilters,
    saveCurrentFilters
  }), [filters, setFilters, results, count, page, setPage, limit, setLimit, isLoading, error, resetFilters, saveCurrentFilters]);

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
}
