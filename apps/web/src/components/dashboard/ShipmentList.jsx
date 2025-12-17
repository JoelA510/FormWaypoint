import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { FileJson, Loader, Eye, ArrowUpFromLine, AlertCircle, CheckCircle, Truck, Package, Archive } from 'lucide-react';
import { Link } from 'react-router-dom';

const TABS = [
    { label: 'Need Review', value: 'draft', icon: AlertCircle },
    { label: 'Ready to Book', value: 'ready_to_book', icon: CheckCircle },
    { label: 'Booked', value: 'booked', icon: Package },
    { label: 'In Transit', value: 'in_transit', icon: Truck },
    { label: 'Exceptions', value: 'exception', icon: AlertCircle },
    { label: 'All', value: undefined, icon: Archive }
];

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
        <div className="space-y-4">
            {/* Header & Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        Work Queue
                        <span className="text-xs font-normal text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                            {shipments.length}
                        </span>
                    </h3>
                    <div className="flex gap-2">
                        <input
                            type="file"
                            id="json-import-input"
                            accept=".json"
                            className="hidden"
                            onChange={handleImportFile}
                        />
                        <button
                            onClick={handleImportClick}
                            disabled={importing}
                            className="btn-secondary text-sm flex items-center gap-2"
                        >
                            {importing ? <Loader className="w-3 h-3 animate-spin" /> : <ArrowUpFromLine className="w-3 h-3" />}
                            Import
                        </button>
                        <Link to="/import" className="btn-primary text-sm flex items-center gap-2">
                            + New Shipment
                        </Link>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 overflow-x-auto">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.value;
                        return (
                            <button
                                key={tab.label}
                                onClick={() => setActiveTab(tab.value)}
                                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap
                                    ${isActive
                                        ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                    }`}
                            >
                                <Icon className={`w-4 h-4 ${isActive ? 'text-primary-600' : 'text-slate-400'}`} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Table */}
                <div className="overflow-x-auto min-h-[300px]">
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <Loader className="w-8 h-8 animate-spin text-slate-400" />
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 bg-slate-50 uppercase border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3">ID</th>
                                    <th className="px-4 py-3">Consignee</th>
                                    <th className="px-4 py-3">Destination</th>
                                    <th className="px-4 py-3">Assigned To</th>
                                    <th className="px-4 py-3">Due Date</th>
                                    <th className="px-4 py-3">Next Action</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {shipments.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="px-4 py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <Archive className="w-8 h-8 opacity-20" />
                                                <p>No shipments found in this queue.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {shipments.map(shipment => {
                                    const nextAction = getNextAction(shipment.status);
                                    return (
                                        <tr key={shipment.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                                {shipment.id.substring(0, 8)}...
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-900">
                                                {shipment.consignee?.name || 'Unknown User'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {shipment.destinationCountry}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {/* Placeholder for AssignedTo logic if we had user names */}
                                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs">
                                                    Me
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {shipment.dueDate ? new Date(shipment.dueDate).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs font-semibold ${nextAction.color}`}>
                                                    {nextAction.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleExport(shipment.id)}
                                                    title="Export JSON Backup"
                                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600"
                                                >
                                                    <FileJson className="w-4 h-4" />
                                                </button>
                                                <Link
                                                    to={`/shipments/${shipment.id}`}
                                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-primary-600"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
