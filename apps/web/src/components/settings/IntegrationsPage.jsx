import { useState } from 'react';
import { Save, CheckCircle, AlertTriangle, Server, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';

export default function IntegrationsPage() {
    const [config, setConfig] = useState({
        activeAdapter: 'JDE', // JDE | SAP
        jdeUrl: 'https://jde-ais.example.com/jderest/v3',
        sapUrl: 'https://sap-gateway.example.com/sap/opu/odata/sap',
        sapClient: '100'
    });
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState(null);

    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);
        try {
            // Check if passwords are provided, otherwise don't send them (to avoid overwriting with empty)
            const payload = { ...config };
            if (!payload.password) delete payload.password;

            await api.post('/erp/configs', payload);
            setMessage({ type: 'success', text: 'Integration settings saved successfully.' });
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Failed to save settings.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <header className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                    <Server className="w-8 h-8 text-indigo-600" />
                    ERP Integration Settings
                </h1>
                <p className="text-slate-500 mt-2">Configure connection details for your Enterprise Resource Planning system.</p>
            </header>

            {message && (
                <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                    {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Adapter Selection */}
                <div className="card md:col-span-1 p-6 h-fit">
                    <h3 className="font-semibold text-slate-900 mb-4">Active System</h3>
                    <div className="space-y-3">
                        <label className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${config.activeAdapter === 'JDE' ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600' : 'border-slate-200 hover:border-slate-300'}`}>
                            <input
                                type="radio"
                                name="adapter"
                                value="JDE"
                                checked={config.activeAdapter === 'JDE'}
                                onChange={(e) => setConfig({ ...config, activeAdapter: e.target.value })}
                                className="sr-only"
                            />
                            <div className="font-bold text-slate-900">JD Edwards</div>
                            <div className="text-xs text-slate-500 mt-1">Orchestrator / AIS</div>
                        </label>

                        <label className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${config.activeAdapter === 'SAP' ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600' : 'border-slate-200 hover:border-slate-300'}`}>
                            <input
                                type="radio"
                                name="adapter"
                                value="SAP"
                                checked={config.activeAdapter === 'SAP'}
                                onChange={(e) => setConfig({ ...config, activeAdapter: e.target.value })}
                                className="sr-only"
                            />
                            <div className="font-bold text-slate-900">SAP S/4HANA</div>
                            <div className="text-xs text-slate-500 mt-1">OData / RFC</div>
                        </label>
                    </div>
                </div>

                {/* Configuration Fields */}
                <div className="card md:col-span-2 p-6">
                    <h3 className="font-semibold text-slate-900 mb-6 flex items-center justify-between">
                        Connection Details
                        <span className="text-xs font-normal bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                            {config.activeAdapter} Active
                        </span>
                    </h3>

                    {config.activeAdapter === 'JDE' && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">AIS Server URL</label>
                                <input
                                    type="text"
                                    value={config.jdeUrl}
                                    onChange={(e) => setConfig({ ...config, jdeUrl: e.target.value })}
                                    className="input-field"
                                    placeholder="https://jde-ais.example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={config.username || ''}
                                    onChange={e => setConfig({ ...config, username: e.target.value })}
                                    placeholder="JDE User"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                                <input
                                    type="password"
                                    className="input-field"
                                    value={config.password || ''}
                                    onChange={e => setConfig({ ...config, password: e.target.value })}
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                    )}

                    {config.activeAdapter === 'SAP' && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Gateway URL</label>
                                <input
                                    type="text"
                                    value={config.sapUrl}
                                    onChange={(e) => setConfig({ ...config, sapUrl: e.target.value })}
                                    className="input-field"
                                    placeholder="https://sap-gateway.example.com"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-1">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
                                    <input
                                        type="text"
                                        value={config.sapClient}
                                        onChange={(e) => setConfig({ ...config, sapClient: e.target.value })}
                                        className="input-field"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">User</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value={config.username || ''}
                                        onChange={e => setConfig({ ...config, username: e.target.value })}
                                        placeholder="SAP User"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                                    <input
                                        type="password"
                                        className="input-field"
                                        value={config.password || ''}
                                        onChange={e => setConfig({ ...config, password: e.target.value })}
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="btn-primary flex items-center gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    Save Configuration
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div >
    );
}
