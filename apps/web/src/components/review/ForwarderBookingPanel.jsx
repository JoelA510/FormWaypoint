import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Loader2, Copy, Check, FileText, Download } from 'lucide-react';

export default function ForwarderBookingPanel({ shipmentId, shipmentStatus }) {
    const [profiles, setProfiles] = useState([]);
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState(null); // { email: { subject, body, to }, bundle: { filename, content } }
    const [error, setError] = useState(null);
    const [copiedField, setCopiedField] = useState(null); // 'subject', 'body', 'recipients'

    useEffect(() => {
        loadProfiles();
    }, []);

    const loadProfiles = async () => {
        try {
            setLoading(true);
            const data = await api.getForwarders();
            setProfiles(data);
            if (data.length > 0) setSelectedProfileId(data[0].id);
        } catch (err) {
            setError('Failed to load forwarder profiles');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async () => {
        if (!selectedProfileId) return;
        setGenerating(true);
        setError(null);
        setResult(null);
        try {
            const res = await api.generateBookingPackage(shipmentId, selectedProfileId);
            setResult(res);
        } catch (err) {
            setError(err.message);
        } finally {
            setGenerating(false);
        }
    };

    const copyToClipboard = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const downloadBundle = () => {
        if (!result?.bundle) return;
        const blob = new Blob([result.bundle.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.bundle.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (loading) return <div className="p-4 text-center"><Loader2 className="animate-spin h-6 w-6 mx-auto text-gray-400" /></div>;

    if (profiles.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-800 mb-2">Forwarder Booking</h3>
                <p className="text-sm text-gray-500">No forwarder profiles found. Please report this to admin (Seed required).</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
            <h3 className="font-semibold text-gray-800 flex items-center justify-between">
                Forwarder Booking
                {shipmentStatus === 'booked' && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Booked</span>}
            </h3>

            {/* Profile Selection */}
            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Select Forwarder</label>
                <select
                    className="w-full border rounded p-2 text-sm"
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                >
                    {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
            </div>

            {/* Generate Button */}
            <button
                onClick={handleGenerate}
                disabled={generating || !selectedProfileId}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
                {generating ? <Loader2 className="animate-spin h-4 w-4" /> : <FileText className="h-4 w-4" />}
                Generate Booking Package
            </button>

            {error && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>}

            {/* Result View */}
            {result && (
                <div className="space-y-3 pt-3 border-t border-gray-100">
                    {/* Email Subject */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-medium text-gray-500">Subject</label>
                            <button
                                onClick={() => copyToClipboard(result.email.subject, 'subject')}
                                className="text-blue-600 text-xs hover:underline flex items-center gap-1"
                            >
                                {copiedField === 'subject' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                Copy
                            </button>
                        </div>
                        <input
                            readOnly
                            value={result.email.subject}
                            className="w-full bg-gray-50 border rounded p-2 text-xs text-gray-700"
                        />
                    </div>

                    {/* Email Body */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-medium text-gray-500">Email Body</label>
                            <button
                                onClick={() => copyToClipboard(result.email.body, 'body')}
                                className="text-blue-600 text-xs hover:underline flex items-center gap-1"
                            >
                                {copiedField === 'body' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                Copy
                            </button>
                        </div>
                        <textarea
                            readOnly
                            value={result.email.body}
                            rows={6}
                            className="w-full bg-gray-50 border rounded p-2 text-xs text-gray-700 font-mono"
                        />
                    </div>

                    {/* Recipients */}
                    <div className="bg-blue-50 p-2 rounded text-xs text-blue-800">
                        <strong>To:</strong> {result.email.to.join(', ')}<br />
                        <strong>CC:</strong> {result.email.cc.join(', ')}
                    </div>

                    {/* Data Bundle */}
                    {result.bundle && (
                        <button
                            onClick={downloadBundle}
                            className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 px-4 rounded flex items-center justify-center gap-2 text-sm transition-colors"
                        >
                            <Download className="h-4 w-4" />
                            Download Data Bundle ({result.bundle.filename})
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
