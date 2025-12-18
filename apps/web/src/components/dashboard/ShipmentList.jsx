import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { FileJson, Loader, Eye, ArrowUpFromLine, AlertCircle, CheckCircle, Truck, Package, Archive, AlertTriangle, ArrowRight, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';

const TABS = [
    { label: 'Need Review', value: 'draft', icon: AlertCircle },
    { label: 'Ready to Book', value: 'ready_to_book', icon: CheckCircle },
    { label: 'Booked', value: 'booked', icon: Package },
    { label: 'In Transit', value: 'in_transit', icon: Truck },
    { label: 'Exceptions', value: 'exception', icon: AlertCircle },
    { label: 'All', value: undefined, icon: Archive }
];

const STATUS_CONFIG = {
    draft: {
        action: 'Review & Validate',
        variant: 'primary',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-l-4 border-l-slate-400',
        icon: AlertCircle
    },
    ready_to_book: {
        action: 'Book Shipment',
        variant: 'success',
        bg: 'bg-green-50',
        text: 'text-green-700',
        border: 'border-l-4 border-l-green-500',
        icon: CheckCircle
    },
    booked: {
        action: 'Track / Print',
        variant: 'info',
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-l-4 border-l-blue-500',
        icon: Package
    },
    in_transit: {
        action: 'Track Status',
        variant: 'info',
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-l-4 border-l-indigo-500',
        icon: Truck
    },
    exception: {
        action: 'Resolve Issue',
        variant: 'critical',
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-l-4 border-l-red-500',
        icon: AlertTriangle
    }
};

export default function ShipmentList() {
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [activeTab, setActiveTab] = useState('draft'); // Default to Need Review

    useEffect(() => {
        const fetchList = async () => {
            setLoading(true);
            try {
                const params = { limit: 20 };
                if (activeTab) params.status = activeTab;

                const data = await api.getShipments(params);
                setShipments(data.data || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchList();
    }, [activeTab]);

    const handleExport = async (id) => {
        try {
            const blob = await api.exportShipment(id);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `shipment-${id}.json`;
            a.click();
        } catch (err) {
            alert('Export failed');
        }
    };

    const handleImportClick = () => {
        document.getElementById('json-import-input').click();
    };

    const handleImportFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setImporting(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);
                await api.importShipment(json);
                alert('Shipment imported successfully!');
                window.location.reload();
            } catch (err) {
                alert('Import failed: ' + err.message);
            } finally {
                setImporting(false);
            }
        };
        reader.readAsText(file);
    };

    const getNextAction = (status) => {
        switch (status) {
            case 'draft': return { label: 'Review & Validate', color: 'text-primary-600' };
            case 'ready_to_book': return { label: 'Book Shipment', color: 'text-green-600' };
            case 'booked': return { label: 'Track / Print', color: 'text-blue-600' };
            case 'in_transit': return { label: 'Track Status', color: 'text-blue-600' };
            case 'exception': return { label: 'Resolve Issue', color: 'text-red-600' };
            default: return { label: 'View Details', color: 'text-slate-500' };
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
                <div className="flex gap-3">
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

            {/* Action Cards List */}
            <div className="space-y-4 min-h-[400px]">
                {loading && (
                    <div className="flex justify-center items-center h-64">
                        <Loader className="w-8 h-8 animate-spin text-slate-300" />
                    </div>
                )}

                {!loading && shipments.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-center">
                        <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                            <Archive className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">No shipments found</h3>
                        <p className="text-slate-500 max-w-sm mt-1">There are no shipments in this queue. Create a new one or change the filter.</p>
                    </div>
                )}

                {!loading && shipments.map(shipment => {
                    const status = shipment.status || 'draft';
                    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
                    const StatusIcon = config.icon;

                    return (
                        <div
                            key={shipment.id}
                            className={`group relative bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-5 border border-slate-200 ${config.border}`}
                        >
                            <div className="flex items-center justify-between">
                                {/* Left: Info */}
                                <div className="flex items-start gap-4">
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
