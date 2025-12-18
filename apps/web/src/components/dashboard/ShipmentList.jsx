import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { FileJson, Loader, Eye, ArrowUpFromLine, AlertCircle, CheckCircle, Truck, Package, Archive, AlertTriangle, ArrowRight, Calendar, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import ScannerInput from '../common/ScannerInput';
import HardwareStatus from '../common/HardwareStatus';

// ... existing code ...

import BulkActionToolbar from './BulkActionToolbar';

// ... existing imports ...

export default function ShipmentList() {
    const [shipments, setShipments] = useState([]);
    const [selectedShipments, setSelectedShipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [activeTab, setActiveTab] = useState('draft'); // Default to Need Review
    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();


    // ... existing useEffect ...

    const handleScan = (code) => {
        console.log('Scanned:', code);
        setSearchQuery(code);

        // Optimistic navigation if it looks like an ID
        // (Assuming IDs are UUIDs or strict format, here blindly checking length)
        if (code.length > 8) {
            // We could try to find it in the current list first
            const found = shipments.find(s => s.id === code || s.trackingNumber === code);
            if (found) {
                navigate(`/shipments/${found.id}`);
                return;
            }
        }
        // Otherwise just filter the list (handled by UI filtering below)
    };

    // Filter shipments based on search
    const filteredShipments = shipments.filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            s.id.toLowerCase().includes(q) ||
            (s.consignee?.name || '').toLowerCase().includes(q) ||
            (s.trackingNumber || '').toLowerCase().includes(q)
        );
    });

    const toggleSelect = (id) => {
        if (selectedShipments.includes(id)) {
            setSelectedShipments(selectedShipments.filter(s => s !== id));
        } else {
            setSelectedShipments([...selectedShipments, id]);
        }
    };

    const handleBulkPrint = () => {
        alert(`Printing labels for ${selectedShipments.length} shipments...`);
        setSelectedShipments([]);
    };

    const handleBulkBook = () => {
        alert(`Booking ${selectedShipments.length} shipments...`);
        setSelectedShipments([]);
    };

    const handleBulkDelete = () => {
        if (confirm(`Delete ${selectedShipments.length} shipments?`)) {
            setShipments(shipments.filter(s => !selectedShipments.includes(s.id)));
            setSelectedShipments([]);
        }
    };


    return (
        <div className="space-y-6">
            {/* Header Area */}
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Work Queue</h1>
                    <p className="text-slate-500 text-sm">Prioritize and process active shipments.</p>
                </div>
                <div className="flex gap-3 items-center">
                    <HardwareStatus />
                    <div className="h-6 w-px bg-slate-200 mx-1"></div>
                    <input
                        type="file"
                        id="json-import-input"
                        accept=".json"
                        className="hidden"
                        onChange={handleImportFile}
                    />
                    <button
                        onClick={() => document.getElementById('json-import-input').click()}
                        disabled={importing}
                        className="btn-secondary text-sm flex items-center gap-2"
                    >
                        {importing ? <Loader className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
                        Import
                    </button>
                    <Link to="/import" className="btn-primary flex items-center gap-2 shadow-lg shadow-primary-500/20 hover:shadow-primary-500/40 transition-shadow">
                        <span className="text-lg leading-none">+</span> New Shipment
                    </Link>
                </div>
            </header>

            {/* Scanner / Search Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="md:col-span-2">
                    <ScannerInput onScan={handleScan} label="Quick Scan (Waybill / Tracking)" />
                </div>
                <div className="flex items-end">
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="text-sm text-slate-500 hover:text-slate-700 underline mb-2"
                        >
                            Clear Search: "{searchQuery}"
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200">
                <div className="flex gap-6 overflow-x-auto pb-px">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.value;
                        return (
                            <button
                                key={tab.label}
                                onClick={() => setActiveTab(tab.value)}
                                className={`flex items-center gap-2 pb-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap
                                    ${isActive
                                        ? 'border-primary-600 text-primary-700'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                    }`}
                            >
                                <Icon className={`w-4 h-4 ${isActive ? 'text-primary-600' : 'text-slate-400'}`} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Bulk Toolbar */}
            <BulkActionToolbar
                count={selectedShipments.length}
                onClear={() => setSelectedShipments([])}
                onPrint={handleBulkPrint}
                onBook={handleBulkBook}
                onDelete={handleBulkDelete}
            />

            {/* Action Cards List */}
            <div className="space-y-4 min-h-[400px]">
                {loading && (
                    <div className="flex justify-center items-center h-64">
                        <Loader className="w-8 h-8 animate-spin text-slate-300" />
                    </div>
                )}

                {!loading && filteredShipments.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-center">
                        <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                            <Archive className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">
                            {searchQuery ? 'No matches found' : 'No shipments found'}
                        </h3>
                        <p className="text-slate-500 max-w-sm mt-1">
                            {searchQuery ? `We couldn't find anything matching "${searchQuery}".` : 'There are no shipments in this queue. Create a new one or change the filter.'}
                        </p>
                    </div>
                )}

                {!loading && filteredShipments.map(shipment => {
                    const status = shipment.status || 'draft';
                    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
                    const StatusIcon = config.icon;
                    const isSelected = selectedShipments.includes(shipment.id);

                    return (
                        <div
                            key={shipment.id}
                            className={`group relative bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-5 border ${isSelected ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/10' : 'border-slate-200'} ${config.border}`}
                        >
                            <div className="flex items-center justify-between">
                                {/* Left: Info + Checkbox */}
                                <div className="flex items-start gap-4">
                                    <div className="flex items-center h-full pt-1">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSelect(shipment.id)}
                                            className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-200 cursor-pointer"
                                        />
                                    </div>
                                    <div className={`mt-1 p-2 rounded-lg ${config.bg} ${config.text}`}>
                                        <StatusIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-semibold text-slate-900">
                                                {shipment.consignee?.name || 'Unknown User'}
                                            </h3>
                                            <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 rounded">
                                                #{shipment.id.substring(0, 8)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-slate-600">
                                            <span className="flex items-center gap-1.5">
                                                <Truck className="w-3.5 h-3.5 text-slate-400" />
                                                {shipment.destinationCountry || 'No Destination'}
                                            </span>
                                            {shipment.dueDate && (
                                                <span className="flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                    Due {new Date(shipment.dueDate).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Actions */}
                                <div className="flex items-center gap-3">
                                    <Link
                                        to={`/shipments/${shipment.id}`}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors 
                                            ${status === 'exception' ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-200' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200'} shadow-sm`}
                                    >
                                        {config.action}
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>

                                    <div className="h-8 w-px bg-slate-200 mx-1"></div>

                                    <button
                                        onClick={() => handleExport(shipment.id)}
                                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                                        title="Export JSON"
                                    >
                                        <FileJson className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

        </div>
    );
}
