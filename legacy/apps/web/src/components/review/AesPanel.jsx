import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '../../services/api';

export default function AesPanel({ shipment, onUpdate }) {
    const [status, setStatus] = useState('unknown'); // unknown, required, exempt, filed
    const [loading, setLoading] = useState(false);
    const [itn, setItn] = useState(shipment.aesItn || '');

    useEffect(() => {
        if (!shipment) return;
        checkRequirement();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shipment.id, shipment.destinationCountry]);

    const checkRequirement = async () => {
        setLoading(true);
        try {
            const res = await api.checkAesRequirement(shipment);
            if (res.aesRequired) {
                if (shipment.aesItn) setStatus('filed');
                else setStatus('required');
            } else {
                setStatus('exempt');
            }
        } catch (err) {
            console.error('Failed to check AES', err);
        } finally {
            setLoading(false);
        }
    };

    const handleItnChange = (val) => {
        setItn(val);
        // In real app, debounce this and save to backend
        onUpdate('aesItn', val);
        if (val && status === 'required') setStatus('filed');
        if (!val && status === 'filed') setStatus('required');
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-600" />
                    AES / EEI Filing
                </h3>
                {loading ? (
                    <span className="text-xs text-slate-500">Checking...</span>
                ) : (
                    <StatusBadge status={status} />
                )}
            </div>

            <div className="space-y-3">
                {status === 'required' && (
                    <div className="bg-amber-50 p-2 rounded text-xs text-amber-800 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                            <strong>Filing Required:</strong> Shipment value exceeds $2,500 or validation rules triggered. Please file and enter ITN.
                        </div>
                    </div>
                )}

                {status === 'exempt' && (
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-emerald-600" />
                        No filing required based on current data.
                    </div>
                )}

                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                        Internal Transaction Number (ITN)
                    </label>
                    <input
                        type="text"
                        placeholder="X202..."
                        className="w-full border rounded p-2 text-sm"
                        value={itn}
                        onChange={(e) => handleItnChange(e.target.value)}
                    />
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }) {
    const styles = {
        unknown: 'bg-gray-100 text-gray-600',
        required: 'bg-red-100 text-red-800',
        exempt: 'bg-green-100 text-green-800',
        filed: 'bg-blue-100 text-blue-800'
    };

    const labels = {
        unknown: 'Checking',
        required: 'Filing Required',
        exempt: 'Exempt',
        filed: 'Filed'
    };

    return (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}>
            {labels[status]}
        </span>
    );
}
