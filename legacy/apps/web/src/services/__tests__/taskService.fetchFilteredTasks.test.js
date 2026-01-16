import { vi } from 'vitest';
import { fetchFilteredTasks } from '../taskService';
import { supabase, __mock } from '../supabaseClient';

vi.mock('../supabaseClient', () => {
  const createBuilder = () => {
    const state = { result: { data: [], error: null, count: 0 } };
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      or: vi.fn(() => builder),
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

describe('fetchFilteredTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mock.reset();
    __mock.setResult({ data: [], error: null, count: 0 });
  });

  it('applies range and returns count', async () => {
    __mock.setResult({ data: [{ id: 1 }], error: null, count: 87 });
    const result = await fetchFilteredTasks({ text: 'foo', from: 20, limit: 20 });
    const builder = __mock.getBuilder();
    expect(supabase.from).toHaveBeenCalledWith('tasks');
    expect(builder.range).toHaveBeenCalledWith(20, 39);
    expect(result.from).toBe(20);
    expect(result.limit).toBe(20);
    expect(result.count).toBe(87);
  });

  it('maps date range filters', async () => {
    const dateFrom = '2025-01-01';
    const dateTo = '2025-12-31';
    await fetchFilteredTasks({ dateFrom, dateTo, limit: 1 });
    const builder = __mock.getBuilder();
    expect(builder.gte).toHaveBeenCalledWith('updated_at', dateFrom);
    expect(builder.lte).toHaveBeenCalledWith('updated_at', dateTo);
  });

  it('respects includeArchived flag', async () => {
    await fetchFilteredTasks({ includeArchived: false, limit: 1 });
    let builder = __mock.getBuilder();
    const archivedCalls = builder.eq.mock.calls.filter(call => call[0] === 'is_archived');
    expect(archivedCalls).toHaveLength(1);
    expect(archivedCalls[0][1]).toBe(false);

    __mock.reset();
    await fetchFilteredTasks({ includeArchived: true, limit: 1 });
    builder = __mock.getBuilder();
    const archivedCallsInclude = builder.eq.mock.calls.filter(call => call[0] === 'is_archived');
    expect(archivedCallsInclude).toHaveLength(0);
  });

  it('filters by priority when provided', async () => {
    await fetchFilteredTasks({ priority: 2, limit: 1 });
    const builder = __mock.getBuilder();
    expect(builder.eq).toHaveBeenCalledWith('priority', 2);
  });

  it('applies sort order mapping', async () => {
    await fetchFilteredTasks({ sortBy: 'title_asc' });
    let builder = __mock.getBuilder();
    expect(builder.order).toHaveBeenCalledWith('title', { ascending: true });

    __mock.reset();
    await fetchFilteredTasks({ sortBy: 'priority_desc' });
    builder = __mock.getBuilder();
    expect(builder.order).toHaveBeenCalledWith('priority', { ascending: false });

    __mock.reset();
    await fetchFilteredTasks({ sortBy: 'unknown' });
    builder = __mock.getBuilder();
    expect(builder.order).toHaveBeenCalledWith('updated_at', { ascending: false });
  });
});
