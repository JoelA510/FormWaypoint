import { vi } from 'vitest';
import { fetchMasterLibraryTasks } from '../taskService';
import { supabase, __mock } from '../supabaseClient';

vi.mock('../supabaseClient', () => {
  const createBuilder = () => {
    const state = { result: { data: [], error: null, count: 0 } };
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      ilike: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => builder),
      abortSignal: vi.fn(() => builder),
      __setResult: (result) => {
        state.result = result;
      },
      then: vi.fn((resolve, reject) => Promise.resolve(state.result).then(resolve, reject))
    };
    return { builder, state };
  };

  let { builder, state } = createBuilder();
  const from = vi.fn(() => builder);

  const reset = () => {
    const created = createBuilder();
    builder = created.builder;
    state = created.state;
    from.mockImplementation(() => builder);
  };

  const setResult = (result) => {
    builder.__setResult(result);
  };

  const getBuilder = () => builder;

  return {
    supabase: { from },
    __mock: {
      reset,
      setResult,
      getBuilder,
      get state() {
        return state;
      }
    }
  };
});

describe('fetchMasterLibraryTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mock.reset();
    __mock.setResult({ data: [], error: null, count: 0 });
  });

  it('queries the master library table and applies pagination', async () => {
    __mock.setResult({ data: [{ id: 'a' }], error: null, count: 12 });
    const result = await fetchMasterLibraryTasks({ from: 40, limit: 10 });
    const builder = __mock.getBuilder();
    expect(supabase.from).toHaveBeenCalledWith('master_library_tasks');
    expect(builder.range).toHaveBeenCalledWith(40, 49);
    expect(result.from).toBe(40);
    expect(result.limit).toBe(10);
    expect(result.count).toBe(12);
  });

  it('filters by task id when provided', async () => {
    await fetchMasterLibraryTasks({ taskId: 'xyz', limit: 5 });
    const builder = __mock.getBuilder();
    expect(builder.eq).toHaveBeenCalledWith('id', 'xyz');
  });

  it('filters by text and applies sort order', async () => {
    await fetchMasterLibraryTasks({ text: 'Alpha', sortBy: 'title_asc' });
    let builder = __mock.getBuilder();
    expect(builder.ilike).toHaveBeenCalledWith('title', '%Alpha%');
    expect(builder.order).toHaveBeenCalledWith('title', { ascending: true });

    __mock.reset();
    await fetchMasterLibraryTasks({ sortBy: 'priority_desc' });
    builder = __mock.getBuilder();
    expect(builder.order).toHaveBeenCalledWith('priority', { ascending: false });
  });

  it('does not escape commas for parameterized title search', async () => {
    await fetchMasterLibraryTasks({ text: 'Bolts, Clips' });
    const builder = __mock.getBuilder();
    expect(builder.ilike).toHaveBeenCalledWith('title', '%Bolts, Clips%');
  });
});
