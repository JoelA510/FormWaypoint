import { useState, useEffect } from 'react';
import { Activity, XCircle, CheckCircle, Clock } from 'lucide-react';

// Mock logs for demonstration
const MOCK_LOGS = [
    { id: 'LOG-1001', system: 'JDE', status: 'SUCCESS', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), details: '{"transactionId":"WD-99281","status":"SUCCESS"}' },
    { id: 'LOG-1002', system: 'JDE', status: 'ERROR', timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), details: 'Connection Timed Out' },
    { id: 'LOG-1003', system: 'SAP', status: 'SUCCESS', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), details: '{"documentId":"IDOC-123","type":"S"}' },
];

export default function SyncLogViewer() {
    const [logs, setLogs] = useState(MOCK_LOGS);

    const [selectedLog, setSelectedLog] = useState(null);

    // TODO: Connect to real API when GET /erp/logs is implemented
    // endpoint: api.get('/erp/logs')

    const LogDetailsModal = ({ log, onClose }) => {
        if (!log) return null;
        return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b flex justify-between items-center">
                        <h3 className="font-semibold">Log Details: {log.id}</h3>
                        <button onClick={onClose}><XCircle className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
                    </div>
                    <div className="p-4 overflow-y-auto font-mono text-xs whitespace-pre-wrap bg-slate-50 text-slate-700">
                        {log.details}
                    </div>
                    <div className="p-4 border-t bg-slate-50 text-slate-500 text-xs">
                        Warning: Details may contain sensitive data. Do not share.
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="card bg-white shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-slate-400" />
                    Sync Activity Log
                </h3>
                <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full border border-orange-100">
                    Mock Data
                </span>
            </div>
            <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                        <tr>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">System</th>
                            <th className="px-4 py-3">Timestamp</th>
                            <th className="px-4 py-3">Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {logs.map(log => (
                            <tr key={log.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3">
                                    {log.status === 'SUCCESS' ? (
                                        <span className="flex items-center gap-1.5 text-emerald-600 font-medium text-xs">
                                            <CheckCircle className="w-3.5 h-3.5" /> Success
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-red-600 font-medium text-xs">
                                            <XCircle className="w-3.5 h-3.5" /> Failed
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3 font-mono text-slate-600">{log.system}</td>
                                <td className="px-4 py-3 text-slate-500">
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                                    <button
                                        onClick={() => setSelectedLog(log)}
                                        className="text-primary-600 hover:text-primary-700 underline truncate max-w-[200px] text-left block"
                                    >
                                        {log.details.substring(0, 50)}...
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {selectedLog && <LogDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
        </div>
    );
}
