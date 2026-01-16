import { useState, useEffect } from 'react';
import { History as HistoryIcon, Clock } from 'lucide-react';
import { api } from '../../services/api';

export default function History({ documentId, shipmentId }) {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (documentId || shipmentId) {
            loadHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId, shipmentId]);

    const loadHistory = async () => {
        try {
            let data;
            if (shipmentId) {
                data = await api.getShipmentHistory(shipmentId);
            } else {
                data = await api.getHistory(documentId);
            }
            setLogs(data);
        } catch (error) {
            console.error('Failed to load history:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatAction = (action) => {
        return action.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    return (
        <div className="card h-full flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                <HistoryIcon className="w-5 h-5 text-slate-500" />
                <h3 className="font-semibold text-slate-900">History</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {isLoading ? (
                    <div className="text-center text-slate-400 py-4">Loading history...</div>
                ) : logs.length === 0 ? (
                    <div className="text-center text-slate-400 py-8 text-sm">
                        No history available.
                    </div>
                ) : (
                    <div className="relative pl-4 border-l border-slate-200 space-y-6">
                        {logs.map((log) => (
                            <div key={log.id} className="relative">
                                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-slate-200 border-2 border-white ring-1 ring-slate-100"></div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-slate-900 text-sm">
                                            {formatAction(log.action)}
                                        </span>
                                        <span className="text-xs text-slate-400 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(log.timestamp).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-600">
                                        by <span className="font-medium">{log.user?.username || 'System'}</span>
                                    </p>
                                    {log.details && (
                                        <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100 mt-1 font-mono">
                                            {log.details}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
