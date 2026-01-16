import { useState } from 'react';
import { ShieldAlert, Loader2, AlertOctagon } from 'lucide-react';
import { api } from '../../services/api';

export default function SanctionsPanel({ shipmentId }) {
    const [status, setStatus] = useState('unknown'); // unknown, clear, match
    const [lastCheck, setLastCheck] = useState(null);
    const [loading, setLoading] = useState(false);
    const [matches, setMatches] = useState([]);

    const runCheck = async () => {
        setLoading(true);
        try {
            const res = await api.screenParties(shipmentId);
            setStatus(res.status === 'MATCH' ? 'match' : 'clear');
            setMatches(res.results.filter(r => r.status === 'MATCH'));
            setLastCheck(new Date());
        } catch (err) {
            console.error(err);
            alert('Failed to run sanctions check');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-slate-600" />
                    Sanctions / DPS
                </h3>
                {status === 'clear' && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Clear</span>}
                {status === 'match' && <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full animate-pulse">Match Found</span>}
            </div>

            <div className="space-y-3">
                <p className="text-xs text-slate-500">
                    Screen shipper, consignee, and other parties against denied party lists.
                </p>

                {status === 'match' && (
                    <div className="bg-red-50 p-2 rounded border border-red-100">
                        <div className="flex items-center gap-2 text-red-800 text-xs font-bold mb-1">
                            <AlertOctagon className="h-3 w-3" />
                            Potential Matches:
                        </div>
                        <ul className="list-disc list-inside text-xs text-red-700">
                            {matches.map((m, i) => (
                                <li key={i}>{m.name} ({m.details})</li>
                            ))}
                        </ul>
                    </div>
                )}

                <button
                    onClick={runCheck}
                    disabled={loading}
                    className={`w-full py-2 px-4 rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors
                        ${status === 'match' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}
                    `}
                >
                    {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Screen Parties'}
                </button>

                {lastCheck && (
                    <div className="text-[10px] text-slate-400 text-center">
                        Last checked: {lastCheck.toLocaleTimeString()}
                    </div>
                )}
            </div>
        </div>
    );
}
