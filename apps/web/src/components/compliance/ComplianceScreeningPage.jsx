import { useState } from 'react';
import { api } from '../../services/api';
import { ShieldCheck, ShieldAlert, Search, AlertOctagon, CheckCircle } from 'lucide-react';

export default function ComplianceScreeningPage() {
    const [form, setForm] = useState({ name: '', country: '', address: '' });
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleScreen = async (e) => {
        e.preventDefault();
        setLoading(true);
        setResult(null);
        try {
            const data = await api.post('/compliance/sanctions/ad-hoc', form);
            setResult(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <header>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-8 h-8 text-indigo-600" />
                    Denied Party Screening
                </h1>
                <p className="text-slate-500 mt-1">
                    Manually screen entities against global watchlists (OFAC, BIS, etc.) before doing business.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Screening Form */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                    <h2 className="text-lg font-semibold mb-4 text-slate-800">Entity Details</h2>
                    <form onSubmit={handleScreen} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Company / Individual Name</label>
                            <input
                                type="text"
                                required
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                className="input-field"
                                placeholder="e.g. Acme Corp"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Country (ISO 2)</label>
                            <input
                                type="text"
                                maxLength={2}
                                value={form.country}
                                onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })}
                                className="input-field uppercase w-24"
                                placeholder="US"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Full Address (Optional)</label>
                            <textarea
                                value={form.address}
                                onChange={e => setForm({ ...form, address: e.target.value })}
                                className="input-field h-24"
                                placeholder="123 Export Blvd..."
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full flex justify-center items-center gap-2 py-3"
                        >
                            {loading ? 'Screening...' : <><Search className="w-4 h-4" /> Screen Entity</>}
                        </button>
                    </form>
                </div>

                {/* Results Panel */}
                <div>
                    {!result && !loading && (
                        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl h-full min-h-[300px] flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                            <ShieldCheck className="w-12 h-12 mb-3 opacity-20" />
                            <p>Enter entity details to check against consolidated denied party lists.</p>
                        </div>
                    )}

                    {result && (
                        <div className={`rounded-xl shadow-sm border p-6 animate-in fade-in slide-in-from-right-4 ${result.status === 'DENIED'
                                ? 'bg-red-50 border-red-200'
                                : 'bg-emerald-50 border-emerald-200'
                            }`}>
                            <div className="flex items-center gap-4 mb-6">
                                <div className={`p-3 rounded-full ${result.status === 'DENIED' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                                    }`}>
                                    {result.status === 'DENIED' ? <AlertOctagon className="w-8 h-8" /> : <CheckCircle className="w-8 h-8" />}
                                </div>
                                <div>
                                    <h3 className={`text-xl font-bold ${result.status === 'DENIED' ? 'text-red-900' : 'text-emerald-900'
                                        }`}>
                                        {result.status === 'DENIED' ? 'Potential Match Found' : 'No Matches Found'}
                                    </h3>
                                    <p className={`text-sm ${result.status === 'DENIED' ? 'text-red-700' : 'text-emerald-700'
                                        }`}>
                                        Screened at {new Date(result.screenedAt).toLocaleTimeString()}
                                    </p>
                                </div>
                            </div>

                            {result.status === 'DENIED' && (
                                <div className="space-y-3">
                                    <h4 className="font-semibold text-red-900 text-sm uppercase tracking-wider">Hit Details</h4>
                                    {result.hits.map((hit, i) => (
                                        <div key={i} className="bg-white/60 p-3 rounded-lg border border-red-100/50">
                                            <div className="flex justify-between items-start">
                                                <span className="font-bold text-red-800">{hit.source}</span>
                                                <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-mono">
                                                    Score: {(hit.score * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            <p className="text-sm text-red-700 mt-1">Reason: {hit.reason}</p>
                                            <p className="text-xs text-red-500 mt-2 font-mono">Entity: {hit.entity}</p>
                                        </div>
                                    ))}
                                    <div className="mt-4 p-3 bg-red-100/50 rounded text-sm text-red-800 italic">
                                        Action Required: Do not proceed with shipping until this match is verified false by a Compliance Officer.
                                    </div>
                                </div>
                            )}

                            {result.status === 'CLEAN' && (
                                <div className="text-emerald-800 text-sm">
                                    <p>No matches were found in the active watchlists. You may proceed with this entity.</p>
                                    <ul className="mt-4 list-disc list-inside opacity-75 text-xs">
                                        <li>OFAC SDN & Consolidated</li>
                                        <li>BIS Entity List</li>
                                        <li>EU Sanctions List</li>
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
