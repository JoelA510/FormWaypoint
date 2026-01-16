import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Calendar, DollarSign, Filter, X } from 'lucide-react';

export default function FilterPanel({ onFilterChange, activeFilters = {} }) {
    const [isOpen, setIsOpen] = useState(false);
    const [filters, setFilters] = useState({
        search: activeFilters.search || '',
        status: activeFilters.status || '',
        startDate: activeFilters.startDate || '',
        endDate: activeFilters.endDate || '',
        minValue: activeFilters.minValue || '',
        maxValue: activeFilters.maxValue || '',
        carrier: activeFilters.carrier || ''
    });

    const handleFilterChange = (key, value) => {
        const newFilters = { ...filters, [key]: value };
        setFilters(newFilters);
        if (onFilterChange) {
            onFilterChange(newFilters);
        }
    };

    const handleClearFilters = () => {
        const emptyFilters = {
            search: '',
            status: '',
            startDate: '',
            endDate: '',
            minValue: '',
            maxValue: '',
            carrier: ''
        };
        setFilters(emptyFilters);
        if (onFilterChange) {
            onFilterChange(emptyFilters);
        }
    };

    const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

    return (
        <div className="mb-6">
            <div className="flex gap-4 items-center">
                {/* Search Bar */}
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search documents..."
                        value={filters.search}
                        onChange={(e) => handleFilterChange('search', e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
                    />
                </div>

                {/* Filter Toggle Button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`px-6 py-3 rounded-xl border transition flex items-center gap-2 ${isOpen || activeFilterCount > 0
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-purple-500'
                        }`}
                >
                    <Filter className="w-5 h-5" />
                    Filters
                    {activeFilterCount > 0 && (
                        <span className="bg-white text-purple-600 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Expandable Filter Panel */}
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 bg-white rounded-xl border border-gray-200 p-6"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Status Filter */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Status
                            </label>
                            <select
                                value={filters.status}
                                onChange={(e) => handleFilterChange('status', e.target.value)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                            >
                                <option value="">All Statuses</option>
                                <option value="pending">Pending</option>
                                <option value="processing">Processing</option>
                                <option value="completed">Completed</option>
                                <option value="failed">Failed</option>
                            </select>
                        </div>

                        {/* Carrier Filter */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Carrier
                            </label>
                            <select
                                value={filters.carrier}
                                onChange={(e) => handleFilterChange('carrier', e.target.value)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                            >
                                <option value="">All Carriers</option>
                                <option value="fedex">FedEx</option>
                                <option value="ups">UPS</option>
                                <option value="usps">USPS</option>
                                <option value="dhl">DHL</option>
                            </select>
                        </div>

                        {/* Start Date */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Calendar className="w-4 h-4 inline mr-1" />
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                            />
                        </div>

                        {/* End Date */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Calendar className="w-4 h-4 inline mr-1" />
                                End Date
                            </label>
                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                            />
                        </div>

                        {/* Min Value */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <DollarSign className="w-4 h-4 inline mr-1" />
                                Min Value (USD)
                            </label>
                            <input
                                type="number"
                                placeholder="0"
                                value={filters.minValue}
                                onChange={(e) => handleFilterChange('minValue', e.target.value)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                            />
                        </div>

                        {/* Max Value */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <DollarSign className="w-4 h-4 inline mr-1" />
                                Max Value (USD)
                            </label>
                            <input
                                type="number"
                                placeholder="999999"
                                value={filters.maxValue}
                                onChange={(e) => handleFilterChange('maxValue', e.target.value)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                            />
                        </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-3">
                        <button
                            onClick={handleClearFilters}
                            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition flex items-center gap-2"
                        >
                            <X className="w-4 h-4" />
                            Clear All
                        </button>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
