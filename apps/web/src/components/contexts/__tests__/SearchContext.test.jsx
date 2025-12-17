import { vi } from 'vitest';
import { useContext } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SearchContext, SearchProvider } from '../SearchContext';
import { fetchFilteredTasks } from '../../../services/taskService';

vi.mock('../../../services/taskService', () => ({
  fetchFilteredTasks: vi.fn(),
  fetchMasterLibraryTasks: vi.fn()
}));

const mockFetchFilteredTasks = fetchFilteredTasks;

function Harness() {
  const value = useContext(SearchContext);
  return (
    <div>
      <button type="button" onClick={() => value.setPage(prev => prev + 1)} data-testid="next-page">
        Next page
      </button>
      <button
        type="button"
        onClick={() => value.setFilters(prev => ({ ...prev, text: 'updated' }))}
        data-testid="update-filter"
      >
        Update filter
      </button>
      <button type="button" onClick={value.resetFilters} data-testid="reset-filters">
        Reset
      </button>
      <span data-testid="page">{value.page}</span>
      <span data-testid="filter-text">{value.filters.text}</span>
      <span data-testid="filter-sort">{value.filters.sortBy}</span>
    </div>
  );
}

describe('SearchProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchFilteredTasks.mockResolvedValue({ data: [], count: 0, from: 0, limit: 20 });
    window.localStorage.clear();
  });

  it('requests the correct page ranges when the page changes', async () => {
    render(
      <SearchProvider>
        <Harness />
      </SearchProvider>
    );

    await waitFor(() => expect(mockFetchFilteredTasks).toHaveBeenCalledTimes(1));
    expect(mockFetchFilteredTasks).toHaveBeenLastCalledWith(expect.objectContaining({ from: 0, limit: 20 }));

    fireEvent.click(screen.getByTestId('next-page'));

    await waitFor(() => expect(mockFetchFilteredTasks).toHaveBeenCalledTimes(2));
    expect(mockFetchFilteredTasks).toHaveBeenLastCalledWith(expect.objectContaining({ from: 20, limit: 20 }));
  });

  it('resets to the first page once when filters change', async () => {
    render(
      <SearchProvider>
        <Harness />
      </SearchProvider>
    );

    await waitFor(() => expect(mockFetchFilteredTasks).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('next-page'));
    fireEvent.click(screen.getByTestId('next-page'));

    await waitFor(() => expect(mockFetchFilteredTasks).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId('page')).toHaveTextContent('2');

    mockFetchFilteredTasks.mockClear();

    fireEvent.click(screen.getByTestId('update-filter'));

    await waitFor(() => expect(mockFetchFilteredTasks).toHaveBeenCalledTimes(1));
    expect(mockFetchFilteredTasks).toHaveBeenLastCalledWith(expect.objectContaining({ from: 0 }));
    expect(screen.getByTestId('page')).toHaveTextContent('0');
  });

  it('hydrates filters from storage', async () => {
    window.localStorage.setItem('sdg.filters.search.anon', JSON.stringify({ text: 'saved', sortBy: 'title_asc' }));

    render(
      <SearchProvider>
        <Harness />
      </SearchProvider>
    );

    await waitFor(() => expect(screen.getByTestId('filter-text')).toHaveTextContent('saved'));
    expect(screen.getByTestId('filter-sort')).toHaveTextContent('title_asc');
    expect(screen.getByTestId('page')).toHaveTextContent('0');
  });

  it('clears storage when filters reset', async () => {
    render(
      <SearchProvider>
        <Harness />
      </SearchProvider>
    );

    await waitFor(() => expect(mockFetchFilteredTasks).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('update-filter'));
    await waitFor(() => expect(screen.getByTestId('filter-text')).toHaveTextContent('updated'));
    expect(window.localStorage.getItem('sdg.filters.search.anon')).toContain('updated');

    fireEvent.click(screen.getByTestId('reset-filters'));
    await waitFor(() => expect(screen.getByTestId('filter-text')).toHaveTextContent(''));
    expect(window.localStorage.getItem('sdg.filters.search.anon')).toBeNull();
  });
});
