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

    return (
        <div className="card bg-white shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-slate-400" />
                    Sync Activity Log
                </h3>
                <span className="text-xs text-slate-500">Last 24 Hours</span>
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
                                <td className="px-4 py-3 text-slate-500 truncate max-w-xs font-mono text-xs">
                                    {log.details}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
