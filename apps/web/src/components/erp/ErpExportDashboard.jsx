import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Loader2, Play, Download, Settings, FileText, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import SyncLogViewer from './SyncLogViewer';

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

    const [error, setError] = useState(null);

    useEffect(() => {
        loadData();
        // Poll for job updates every 5 seconds
        const interval = setInterval(fetchJobs, 5000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadData = async () => {
        setLoading(true);
        setError(null);
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
            setError('Failed to load configurations.');
        }
    };

    const fetchJobs = async () => {
        try {
            const data = await api.getErpJobs();
            setJobs(data);
        } catch (err) {
            console.error(err);
            // Don't override main error if configs failed, but maybe show a toast in future
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

    // System Health Logic
    const getSystemHealth = () => {
        if (loading) return { status: 'loading', text: 'Checking System...', color: 'bg-slate-100 text-slate-500' };
        const failedLast24h = jobs.filter(j =>
            j.status === 'FAILED' &&
            new Date(j.createdAt) > new Date(Date.now() - 86400000)
        ).length;

        if (failedLast24h > 0) return { status: 'warning', text: `${failedLast24h} Failed Jobs (24h)`, color: 'bg-red-100 text-red-700' };
        return { status: 'healthy', text: 'All Systems Operational', color: 'bg-emerald-100 text-emerald-700' };
    };

    const health = getSystemHealth();

    const handleRetry = async (job) => {
        if (!confirm('Retry this export job?')) return;
        setRunningJob(true);
        try {
            await api.runErpJob({
                configId: job.configId,
                fromDate: job.fromDate,
                toDate: job.toDate
            });
            fetchJobs();
        } catch (err) {
            alert('Retry failed: ' + err.message);
        } finally {
            setRunningJob(false);
        }
    };

    if (loading && jobs.length === 0) return <div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto text-slate-400" /></div>;

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">ERP Export Monitor</h1>
                    <p className="text-slate-500">System health and integration status</p>
                </div>

                <div className="flex flex-col items-end gap-2">
                    {/* System Health Pulse */}
                    <div className={`px-4 py-2 rounded-full flex items-center gap-3 ${health.color} border border-transparent transition-all shadow-sm`}>
                        <div className="relative flex h-3 w-3">
                            {health.status === 'healthy' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                            {health.status === 'warning' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                            <span className={`relative inline-flex rounded-full h-3 w-3 ${health.status === 'healthy' ? 'bg-emerald-500' : health.status === 'warning' ? 'bg-red-500' : 'bg-slate-400'}`}></span>
                        </div>
                        <span className="font-semibold text-sm">{health.text}</span>
                    </div>

                    <button
                        onClick={() => {
                            const today = new Date().toISOString().split('T')[0];
                            setFromDate(today);
                            setToDate(today);
                            setShowRunModal(true);
                        }}
                        className="text-xs text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-1"
                    >
                        <Play className="h-3 w-3" />
                        Run Manual Export
                    </button>
                </div>
            </div>

            {/* Configs List (Mini Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {configs.map(config => (
                    <div key={config.id} className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm flex items-start justify-between hover:border-primary-200 transition-colors group">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <FileText className="w-4 h-4 text-slate-400 group-hover:text-primary-500" />
                                <h3 className="font-semibold text-slate-800">{config.name}</h3>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                <span className={`px-2 py-0.5 rounded ${config.targetType === 'FILE' ? 'bg-amber-50 text-amber-700' : 'bg-violet-50 text-violet-700'}`}>
                                    {config.targetType}
                                </span>
                                <span className="bg-slate-100 px-2 py-0.5 rounded uppercase">{config.format}</span>
                            </div>
                        </div>
                        <Settings className="h-4 w-4 text-slate-300 group-hover:text-primary-400 cursor-pointer" />
                    </div>
                ))}
            </div>

            {/* Job History Table */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h2 className="font-semibold text-slate-800">Job Activity Log</h2>
                    <button onClick={fetchJobs} className="text-slate-400 hover:text-primary-600 transition-colors">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                            <th className="px-6 py-3">Run Date</th>
                            <th className="px-6 py-3">Config</th>
                            <th className="px-6 py-3">Range</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {jobs.map(job => (
                            <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                                    {new Date(job.createdAt).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 font-medium text-slate-900">
                                    {job.config?.name || 'Unknown'}
                                </td>
                                <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                                    {new Date(job.fromDate).toLocaleDateString()} - {new Date(job.toDate).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4">
                                    {job.status === 'SUCCESS' && (
                                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full w-fit">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Success
                                        </span>
                                    )}
                                    {job.status === 'FAILED' && (
                                        <div className="flex flex-col items-start gap-1">
                                            <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full w-fit">
                                                <XCircle className="w-3.5 h-3.5" /> Failed
                                            </span>
                                            {job.errorMessage && <span className="text-[10px] text-red-500 max-w-[150px] truncate">{job.errorMessage}</span>}
                                        </div>
                                    )}
                                    {job.status === 'RUNNING' && (
                                        <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full w-fit animate-pulse">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {job.status === 'SUCCESS' && (
                                        <button onClick={() => handleDownload(job)} className="text-slate-500 hover:text-primary-600 transition-colors inline-flex items-center gap-1 text-xs font-medium bg-white border border-slate-200 px-2 py-1 rounded shadow-sm hover:shadow">
                                            <Download className="h-3 w-3" />
                                            Log
                                        </button>
                                    )}
                                    {job.status === 'FAILED' && (
                                        <button
                                            onClick={() => handleRetry(job)}
                                            className="text-amber-600 hover:text-amber-800 transition-colors inline-flex items-center gap-1 text-xs font-medium bg-amber-50 border border-amber-200 px-2 py-1 rounded hover:bg-amber-100"
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                            Retry
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {jobs.length === 0 && (
                            <tr>
                                <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                                            <Settings className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <p>No export jobs have been run yet.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Transaction Logs */}
            <SyncLogViewer />

            {/* Run Job Modal - Kept mostly same but cleaner */}
            {showRunModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 scale-100 animate-in zoom-in-95 duration-200">
                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Play className="w-5 h-5 text-primary-600" /> Run Manual Export
                        </h2>
                        <form onSubmit={handleRunJob} className="space-y-4">
                            {/* ... Form Content ... */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Configuration</label>
                                <select
                                    className="input-field"
                                    value={selectedConfigId}
                                    onChange={e => setSelectedConfigId(e.target.value)}
                                >
                                    {configs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">From Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="input-field"
                                        value={fromDate}
                                        onChange={e => setFromDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">To Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="input-field"
                                        value={toDate}
                                        onChange={e => setToDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowRunModal(false)}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={runningJob}
                                    className="btn-primary flex items-center gap-2"
                                >
                                    {runningJob ? <Loader2 className="animate-spin h-4 w-4" /> : <Play className="w-4 h-4 ml-0.5" />}
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
