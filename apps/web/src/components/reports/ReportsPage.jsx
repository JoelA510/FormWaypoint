import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { BarChart3, FileText, AlertTriangle, ShieldCheck, Download, Calendar } from 'lucide-react';

export default function ReportsPage() {
    const [dateRange, setDateRange] = useState('30'); // '7', '30', '90'
    const [loading, setLoading] = useState(false);
    const [shipmentStats, setShipmentStats] = useState(null);
    const [validationStats, setValidationStats] = useState(null);
    const [overrides, setOverrides] = useState([]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Calculate dates
            const to = new Date();
            const from = new Date();
            from.setDate(from.getDate() - parseInt(dateRange));

            const query = {
                from: from.toISOString(),
                to: to.toISOString()
            };

            const [shipments, validation, overridesList] = await Promise.all([
                api.request(`/reports/shipments-summary?from=${query.from}&to=${query.to}`),
                api.request(`/reports/validation-summary?from=${query.from}&to=${query.to}`),
                api.request(`/reports/overrides?from=${query.from}&to=${query.to}`)
            ]);

            setShipmentStats(shipments);
            setValidationStats(validation);
            setOverrides(overridesList);

        } catch (err) {
            console.error('Failed to load reports:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange]);

    const handleDownload = () => {
        // Simple CSV export of overrides for now
        if (!overrides.length) return;

        const headers = ['Shipment ID', 'ERP Order ID', 'Dismissed Codes', 'Updated At'];
        const rows = overrides.map(o => [
            o.shipmentId,
            o.erpOrderId || '',
            (o.dismissedCodes || []).join('; '),
            new Date(o.updatedAt).toLocaleDateString()
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `overrides-report-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
                    <p className="text-slate-500">Operational visibility and compliance health</p>
                </div>

                <div className="flex items-center gap-4">
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        className="input-field"
                    >
                        <option value="7">Last 7 Days</option>
                        <option value="30">Last 30 Days</option>
                        <option value="90">Last 90 Days</option>
                    </select>

                    <button
                        onClick={loadData}
                        className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                        title="Refresh"
                    >
                        <Calendar className="w-5 h-5" />
                    </button>

                    <button
                        onClick={handleDownload}
                        className="btn-secondary flex items-center gap-2"
                        disabled={!overrides.length}
                    >
                        <Download className="w-4 h-4" /> Export Overrides
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="card p-4 flex items-center gap-4">
                            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                                <BarChart3 className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Total Shipments</p>
                                <p className="text-2xl font-bold text-slate-900">{shipmentStats?.total || 0}</p>
                            </div>
                        </div>

                        <div className="card p-4 flex items-center gap-4">
                            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                                <FileText className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Doc Types Generated</p>
                                <p className="text-2xl font-bold text-slate-900">{shipmentStats?.byDocType?.length || 0}</p>
                            </div>
                        </div>

                        <div className="card p-4 flex items-center gap-4">
                            <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Active Issues</p>
                                <p className="text-2xl font-bold text-slate-900">
                                    {validationStats?.activeIssues?.reduce((acc, curr) => acc + curr.count, 0) || 0}
                                </p>
                            </div>
                        </div>

                        <div className="card p-4 flex items-center gap-4">
                            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Overrides</p>
                                <p className="text-2xl font-bold text-slate-900">{validationStats?.totalDismissedOverrides || 0}</p>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Tables */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Shipments by Destination */}
                        <div className="card">
                            <h3 className="text-lg font-semibold mb-4">Top Destinations</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 bg-slate-50 uppercase">
                                        <tr>
                                            <th className="px-4 py-3">Country</th>
                                            <th className="px-4 py-3 text-right">Shipments</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(shipmentStats?.byDestination || []).length === 0 && (
                                            <tr><td colSpan="2" className="px-4 py-3 text-center text-slate-400">No data</td></tr>
                                        )}
                                        {(shipmentStats?.byDestination || []).map((d, i) => (
                                            <tr key={i} className="border-b border-slate-100">
                                                <td className="px-4 py-3 font-medium">{d.country}</td>
                                                <td className="px-4 py-3 text-right">{d.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Common Validation Issues */}
                        <div className="card">
                            <h3 className="text-lg font-semibold mb-4">Common Validation Issues</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 bg-slate-50 uppercase">
                                        <tr>
                                            <th className="px-4 py-3">Issue Code</th>
                                            <th className="px-4 py-3 text-right">Count</th>
                                            <th className="px-4 py-3 text-right">Shipments Affected</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(validationStats?.activeIssues || []).length === 0 && (
                                            <tr><td colSpan="3" className="px-4 py-3 text-center text-slate-400">No active issues found</td></tr>
                                        )}
                                        {(validationStats?.activeIssues || []).slice(0, 5).map((d, i) => (
                                            <tr key={i} className="border-b border-slate-100">
                                                <td className="px-4 py-3 font-mono text-xs text-amber-600">{d.code}</td>
                                                <td className="px-4 py-3 text-right">{d.count}</td>
                                                <td className="px-4 py-3 text-right">{d.affectedShipments}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Overrides List */}
                    <div className="card">
                        <h3 className="text-lg font-semibold mb-4">Recent Overrides</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 bg-slate-50 uppercase">
                                    <tr>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Shipment Ref</th>
                                        <th className="px-4 py-3">Dismissed Codes</th>
                                        <th className="px-4 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overrides.length === 0 && (
                                        <tr><td colSpan="4" className="px-4 py-3 text-center text-slate-400">No overrides found</td></tr>
                                    )}
                                    {overrides.map((o, i) => (
                                        <tr key={i} className="border-b border-slate-100">
                                            <td className="px-4 py-3">{new Date(o.updatedAt).toLocaleDateString()}</td>
                                            <td className="px-4 py-3">{o.erpOrderId || o.shipmentId}</td>
                                            <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                                                {(o.dismissedCodes || []).map(code => (
                                                    <span key={code} className="bg-slate-100 px-1 py-0.5 rounded mr-1">
                                                        {code}
                                                    </span>
                                                ))}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <a href={`/shipments/${o.shipmentId}`} className="text-primary-600 hover:text-primary-800 underline">View</a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </>
            )}
        </div>
    );
}
