const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export function loadFilters(key) {
  if (!isBrowser()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (_error) {
    // Swallow storage errors; persistence is a best-effort enhancement.
  }
  return {};
}

export function saveFilters(key, value) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Ignore storage write failures.
  }
}

export function clearFilters(key) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (_error) {
    // Ignore storage clear failures.
  }
}
