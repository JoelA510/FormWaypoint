import { useContext } from 'react';
import { SearchContext } from '../contexts/SearchContext';

export default function SearchBar() {
  const { filters, setFilters, resetFilters, saveCurrentFilters } = useContext(SearchContext);

  return (
    <form className="flex flex-wrap gap-2 items-end" onSubmit={event => event.preventDefault()}>
      <label className="flex flex-col text-sm">
        <span>Search</span>
        <input
          type="search"
          value={filters.text}
          onChange={event =>
            setFilters(prev => ({ ...prev, text: event.target.value }))
          }
          placeholder="Search tasks"
        />
      </label>
      <label className="flex flex-col text-sm">
        <span>Updated from</span>
        <input
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={event =>
            setFilters(prev => ({
              ...prev,
              dateFrom: event.target.value ? event.target.value : null
            }))
          }
        />
      </label>
      <label className="flex flex-col text-sm">
        <span>Updated to</span>
        <input
          type="date"
          value={filters.dateTo ?? ''}
          onChange={event =>
            setFilters(prev => ({
              ...prev,
              dateTo: event.target.value ? event.target.value : null
            }))
          }
        />
      </label>
      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          checked={Boolean(filters.includeArchived)}
          onChange={event =>
            setFilters(prev => ({ ...prev, includeArchived: event.target.checked }))
          }
        />
        <span>Include archived</span>
      </label>
      <label className="flex flex-col text-sm">
        <span>Priority</span>
        <select
          value={filters.priority ?? ''}
          onChange={event =>
            setFilters(prev => ({
              ...prev,
              priority: event.target.value === '' ? null : Number(event.target.value)
            }))
          }
        >
          <option value="">Any priority</option>
          <option value="0">Low</option>
          <option value="1">Medium</option>
          <option value="2">High</option>
        </select>
      </label>
      <label className="flex flex-col text-sm">
        <span>Sort</span>
        <select
          value={filters.sortBy}
          onChange={event =>
            setFilters(prev => ({
              ...prev,
              sortBy: event.target.value
            }))
          }
        >
          <option value="updated_desc">Updated (newest)</option>
          <option value="title_asc">Title (A–Z)</option>
          <option value="priority_desc">Priority (high first)</option>
        </select>
      </label>
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={saveCurrentFilters}>
          Save filters
        </button>
        <button type="button" onClick={resetFilters}>
          Reset
        </button>
      </div>
    </form>
  );
}
