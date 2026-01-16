import { vi } from 'vitest';
import { useContext } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MasterLibraryContext, MasterLibraryProvider } from '../MasterLibraryContext';
import { fetchMasterLibraryTasks } from '../../../services/taskService';

vi.mock('../../../services/taskService', () => ({
  fetchFilteredTasks: vi.fn(),
  fetchMasterLibraryTasks: vi.fn()
}));

const mockFetchMasterLibraryTasks = fetchMasterLibraryTasks;

const wrapper = ({ children }) => (
  <MasterLibraryProvider>{children}</MasterLibraryProvider>
);

describe('MasterLibraryProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchMasterLibraryTasks.mockResolvedValue({ data: [], count: 0, from: 0, limit: 20 });
    window.localStorage.clear();
  });

  it('requests the correct page ranges when the page changes', async () => {
    const { result } = renderHook(() => useContext(MasterLibraryContext), { wrapper });

    await waitFor(() => expect(mockFetchMasterLibraryTasks).toHaveBeenCalledTimes(1));
    expect(mockFetchMasterLibraryTasks).toHaveBeenLastCalledWith(expect.objectContaining({ from: 0, limit: 20 }));

    await act(async () => {
      result.current.setPage(prev => prev + 1);
    });

    await waitFor(() => expect(mockFetchMasterLibraryTasks).toHaveBeenCalledTimes(2));
    expect(mockFetchMasterLibraryTasks).toHaveBeenLastCalledWith(expect.objectContaining({ from: 20, limit: 20 }));
  });

  it('checks the library cache before querying the backend', async () => {
    mockFetchMasterLibraryTasks
      .mockResolvedValueOnce({ data: [{ id: 'cached', title: 'Cached' }], count: 1, from: 0, limit: 20 })
      .mockResolvedValueOnce({ data: [{ id: 'remote', title: 'Remote' }], count: 1, from: 0, limit: 1 });

    const { result } = renderHook(() => useContext(MasterLibraryContext), { wrapper });

    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const cached = await result.current.checkTaskLibraryStatus('cached');
    expect(cached).toBe(true);
    expect(mockFetchMasterLibraryTasks).toHaveBeenCalledTimes(1);

    const remote = await result.current.checkTaskLibraryStatus('remote');
    expect(remote).toBe(true);
    expect(mockFetchMasterLibraryTasks).toHaveBeenCalledTimes(2);
    expect(mockFetchMasterLibraryTasks).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'remote', from: 0, limit: 1 }));
  });

  it('hydrates and resets filters with persistence', async () => {
    window.localStorage.setItem('sdg.filters.masterlib.anon', JSON.stringify({ text: 'stored', sortBy: 'title_asc' }));

    const { result } = renderHook(() => useContext(MasterLibraryContext), { wrapper });

    await waitFor(() => expect(result.current.filters.text).toBe('stored'));
    expect(result.current.filters.sortBy).toBe('title_asc');

    await act(async () => {
      result.current.setFilters(prev => ({ ...prev, text: 'updated' }));
    });

    await waitFor(() => expect(result.current.filters.text).toBe('updated'));
    expect(window.localStorage.getItem('sdg.filters.masterlib.anon')).toContain('updated');

    act(() => {
      result.current.resetFilters();
    });

    await waitFor(() => expect(result.current.filters.text).toBe(''));
    expect(window.localStorage.getItem('sdg.filters.masterlib.anon')).toBeNull();
  });

  it('resets to the first page once when filters change', async () => {
    const { result } = renderHook(() => useContext(MasterLibraryContext), { wrapper });

    await waitFor(() => expect(mockFetchMasterLibraryTasks).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.setPage(prev => prev + 2);
    });

    await waitFor(() => expect(mockFetchMasterLibraryTasks).toHaveBeenCalledTimes(2));
    expect(result.current.page).toBe(2);

    mockFetchMasterLibraryTasks.mockClear();

    await act(async () => {
      result.current.setFilters(prev => ({ ...prev, text: 'updated' }));
    });

    await waitFor(() => expect(mockFetchMasterLibraryTasks).toHaveBeenCalledTimes(1));
    expect(mockFetchMasterLibraryTasks).toHaveBeenLastCalledWith(expect.objectContaining({ from: 0 }));
    expect(result.current.page).toBe(0);
  });
});
