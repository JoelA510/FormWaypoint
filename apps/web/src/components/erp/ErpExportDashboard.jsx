import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Loader2, Play, Download, Settings } from 'lucide-react';

export default function ErpExportDashboard() {
    const [configs, setConfigs] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [runningJob, setRunningJob] = useState(null);

    // Modal Form State
    const [showRunModal, setShowRunModal] = useState(false);
    const [selectedConfigId, setSelectedConfigId] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    useEffect(() => {
        loadData();
        // Poll for job updates every 5 seconds
        const interval = setInterval(fetchJobs, 5000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadData = async () => {
        setLoading(true);
        await Promise.all([fetchConfigs(), fetchJobs()]);
        setLoading(false);
    };

    const fetchConfigs = async () => {
        try {
            const data = await api.getErpConfigs();
            setConfigs(data);
            if (data.length > 0 && !selectedConfigId) setSelectedConfigId(data[0].id);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchJobs = async () => {
        try {
            const data = await api.getErpJobs();
            setJobs(data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleRunJob = async (e) => {
        e.preventDefault();
        setRunningJob(true);
        try {
            await api.runErpJob({
                configId: selectedConfigId,
                fromDate,
                toDate
            });
            setShowRunModal(false);
            fetchJobs(); // Refresh immediately
        } catch (err) {
            alert('Failed to start job: ' + err.message);
        } finally {
            setRunningJob(false);
        }
    };

    // Helper to download File result (Mocked as if it returned file content or path)
    const handleDownload = () => {
        alert('In a real app, this would download the generated file from storage.');
    };

    if (loading && jobs.length === 0) return <div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto text-gray-400" /></div>;

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">ERP Export Dashboard</h1>
                    <p className="text-gray-500">Manage and monitor shipment completion exports.</p>
                </div>
                <button
                    onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        setFromDate(today);
                        setToDate(today);
                        setShowRunModal(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2"
                >
                    <Play className="h-4 w-4" />
                    Run Manual Export
                </button>
            </div>

            {/* Configs List (Mini Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {configs.map(config => (
                    <div key={config.id} className="bg-white border p-4 rounded-lg shadow-sm flex items-start justify-between">
                        <div>
                            <h3 className="font-semibold text-gray-800">{config.name}</h3>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                <span className={`px-2 py-0.5 rounded ${config.targetType === 'FILE' ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'}`}>
                                    {config.targetType}
                                </span>
                                <span className="bg-gray-100 px-2 py-0.5 rounded">{config.format}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-2 truncate w-48" title={config.destination}>
                                {config.destination}
                            </p>
                        </div>
                        <Settings className="h-5 w-5 text-gray-300" />
                    </div>
                ))}
            </div>

            {/* Job History Table */}
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-800">Export Job History</h2>
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                        <tr>
                            <th className="px-6 py-3">Run Date</th>
                            <th className="px-6 py-3">Configuration</th>
                            <th className="px-6 py-3">Date Range</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Result</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {jobs.map(job => (
                            <tr key={job.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-gray-600">
                                    {new Date(job.createdAt).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900">
                                    {job.config?.name || 'Unknown'}
                                </td>
                                <td className="px-6 py-4 text-gray-500">
                                    {new Date(job.fromDate).toLocaleDateString()} - {new Date(job.toDate).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold
                                        ${job.status === 'SUCCESS' ? 'bg-green-100 text-green-800' :
                                            job.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                                'bg-blue-100 text-blue-800 animate-pulse'}`}>
                                        {job.status}
                                    </span>
                                    {job.errorMessage && <p className="text-xs text-red-600 mt-1">{job.errorMessage}</p>}
                                </td>
                                <td className="px-6 py-4">
                                    {job.status === 'SUCCESS' && (
                                        <button onClick={() => handleDownload(job)} className="text-blue-600 hover:underline flex items-center gap-1">
                                            <Download className="h-3 w-3" />
                                            Download
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {jobs.length === 0 && (
                            <tr>
                                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No export jobs found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Run Job Modal */}
            {showRunModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
                        <h2 className="text-lg font-bold mb-4">Run Manual Export</h2>
                        <form onSubmit={handleRunJob} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Configuration</label>
                                <select
                                    className="w-full border rounded p-2"
                                    value={selectedConfigId}
                                    onChange={e => setSelectedConfigId(e.target.value)}
                                >
                                    {configs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full border rounded p-2"
                                        value={fromDate}
                                        onChange={e => setFromDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full border rounded p-2"
                                        value={toDate}
                                        onChange={e => setToDate(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowRunModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={runningJob}
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {runningJob && <Loader2 className="animate-spin h-4 w-4" />}
                                    Start Export
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
