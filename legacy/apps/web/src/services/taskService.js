import { supabase } from './supabaseClient';

const TABLE_NAME = 'tasks';
const MASTER_LIBRARY_TABLE = 'master_library_tasks';

const SORT_MAP = {
  updated_desc: { column: 'updated_at', ascending: false },
  title_asc: { column: 'title', ascending: true },
  priority_desc: { column: 'priority', ascending: false }
};

const applySort = (query, sortBy) => {
  const config = SORT_MAP[sortBy] ?? SORT_MAP.updated_desc;
  if (typeof query.order === 'function') {
    return query.order(config.column, { ascending: config.ascending });
  }
  return query;
};

export async function fetchFilteredTasks({
  text = '',
  status = null,
  taskType = null,
  assigneeId = null,
  projectId = null,
  from = 0,
  limit = 20,
  dateFrom = null,
  dateTo = null,
  includeArchived = false,
  priority = null,
  signal = null,
  sortBy = 'updated_desc'
} = {}) {
  let query = supabase.from(TABLE_NAME).select('*', { count: 'exact' });

  if (signal && typeof query.abortSignal === 'function') {
    query = query.abortSignal(signal);
  }

  if (status !== null) {
    query = query.eq('status', status);
  }

  if (taskType !== null) {
    query = query.eq('task_type', taskType);
  }

  if (assigneeId !== null) {
    query = query.eq('assignee_id', assigneeId);
  }

  if (projectId !== null) {
    query = query.eq('project_id', projectId);
  }

  if (text) {
    // Escape special characters for Supabase like/ilike syntax (%, _, \)
    // And also escape commas because .or() uses comma as a separator
    const sanitized = text.replace(/[\\%_]/g, '\\$&').replace(/,/g, '\\,');
    query = query.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
  }

  if (dateFrom) {
    query = query.gte('updated_at', dateFrom);
  }

  if (dateTo) {
    query = query.lte('updated_at', dateTo);
  }

  if (!includeArchived) {
    query = query.eq('is_archived', false);
  }

  if (priority !== null) {
    query = query.eq('priority', priority);
  }

  query = applySort(query, sortBy);
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    throw error;
  }

  return {
    data: data ?? [],
    count: typeof count === 'number' ? count : 0,
    from,
    limit
  };
}

export async function fetchMasterLibraryTasks({
  from = 0,
  limit = 20,
  taskId = null,
  signal = null,
  text = '',
  sortBy = 'updated_desc'
} = {}) {
  let query = supabase.from(MASTER_LIBRARY_TABLE).select('*', { count: 'exact' });

  if (signal && typeof query.abortSignal === 'function') {
    query = query.abortSignal(signal);
  }

  if (taskId != null) {
    query = query.eq('id', taskId);
  }

  if (text) {
    query = query.ilike('title', `%${text}%`);
  }

  query = applySort(query, sortBy);
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    throw error;
  }

  return {
    data: data ?? [],
    count: typeof count === 'number' ? count : 0,
    from,
    limit
  };
}
