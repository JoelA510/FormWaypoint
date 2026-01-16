import { useContext } from 'react';
import { MasterLibraryContext } from '../contexts/MasterLibraryContext';

export default function MasterLibraryToolbar() {
  const { filters, setFilters, resetFilters, saveCurrentFilters } = useContext(MasterLibraryContext);

  return (
    <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={event => event.preventDefault()}>
      <label className="flex flex-col text-sm">
        <span>Search templates</span>
        <input
          type="search"
          value={filters.text}
          onChange={event =>
            setFilters(prev => ({
              ...prev,
              text: event.target.value
            }))
          }
          placeholder="Search library"
        />
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
