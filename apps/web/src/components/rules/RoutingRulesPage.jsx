import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Play, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';

// Mock API calls for rules (replace with real endpoints later)
const mockRulesApi = {
    get: async () => [
        { id: 1, name: 'Heavy Weight LTL', priority: 1, condition: { field: 'weight', op: 'gt', value: 150 }, action: { type: 'SET_CARRIER', value: 'FEDEX_FREIGHT' } },
        { id: 2, name: 'High Value Insurance', priority: 2, condition: { field: 'value', op: 'gt', value: 5000 }, action: { type: 'ADD_SERVICE', value: 'INSURANCE' } }
    ],
    save: async (rules) => new Promise(r => setTimeout(r, 500))
};

export default function RoutingRulesPage() {
    const [rules, setRules] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        loadRules();
    }, []);

    const loadRules = async () => {
        try {
            // Check if endpoint exists, otherwise fallback to mock for demo
            try {
                const data = await api.get('/rules');
                setRules(data);
            } catch (apiErr) {
                console.warn('Rules API not found, using Mock data');
                // Keep mock data for now if API fails (since backend might not have this route yet)
                const mock = [
                    { id: 1, name: 'Heavy Weight LTL', priority: 1, condition: { field: 'weight', op: 'gt', value: 150 }, action: { type: 'SET_CARRIER', value: 'FEDEX_FREIGHT' } },
                    { id: 2, name: 'High Value Insurance', priority: 2, condition: { field: 'value', op: 'gt', value: 5000 }, action: { type: 'ADD_SERVICE', value: 'INSURANCE' } }
                ];
                setRules(mock);
            }
        } catch (e) { console.error(e); }
    };

    const addRule = () => {
        setRules([...rules, {
            id: Date.now(), // temp id
            name: 'New Rule',
            priority: rules.length + 1,
            condition: { field: 'weight', op: 'gt', value: 0 },
            action: { type: 'SET_CARRIER', value: '' },
            enabled: true
        }]);
    };

    const updateRule = (index, field, value) => {
        const newRules = [...rules];
        if (field.includes('.')) {
            const [parent, child] = field.split('.');
            newRules[index] = {
                ...newRules[index],
                [parent]: { ...newRules[index][parent], [child]: value }
            };
        } else {
            newRules[index] = { ...newRules[index], [field]: value };
        }
        setRules(newRules);
    };

    const removeRule = (index) => {
        const newRules = [...rules];
        newRules.splice(index, 1);
        setRules(newRules);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);
        try {
            await api.post('/rules', rules);
            setMessage({ type: 'success', text: 'Rules saved successfully.' });
        } catch (err) {
            console.error(err);
            // Fallback success for demo if 404
            if (err.response && err.response.status === 404) {
                setMessage({ type: 'success', text: 'Rules saved (Mock Mode - API missing).' });
            } else {
                setMessage({ type: 'error', text: 'Failed to save rules.' });
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-6">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                        <Play className="w-8 h-8 text-indigo-600" />
                        Routing Rules Engine
                    </h1>
                    <p className="text-slate-500 mt-2">Define "If/Then" logic to automate carrier selection and shipping options.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="btn-primary flex items-center gap-2"
                >
                    {isSaving ? 'Saving...' : <><Save className="w-4 h-4" /> Save Rules</>}
                </button>
            </header>

            {message && (
                <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                    {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    {message.text}
                </div>
            )}

            <div className="space-y-4">
                {rules.map((rule, index) => (
                    <div key={rule.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2">
                        {/* Priority / Drag Handle (Visual only for now) */}
                        <div className="text-slate-300 font-mono text-xs w-6 text-center select-none">
                            {index + 1}
                        </div>

                        {/* Enabled Toggle */}
                        <input
                            type="checkbox"
                            checked={rule.enabled !== false}
                            onChange={(e) => updateRule(index, 'enabled', e.target.checked)}
                            className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-200"
                        />

                        {/* Rule Name */}
                        <div className="w-48">
                            <input
                                type="text"
                                value={rule.name}
                                onChange={(e) => updateRule(index, 'name', e.target.value)}
                                className="input-field text-sm font-semibold"
                                placeholder="Rule Name"
                            />
                        </div>

                        {/* Condition Block */}
                        <div className="flex-1 bg-slate-50 rounded-lg p-2 border border-slate-200 flex items-center gap-2 text-sm">
                            <span className="font-bold text-slate-500 text-xs uppercase px-1">IF</span>
                            <select
                                value={rule.condition.field}
                                onChange={(e) => updateRule(index, 'condition.field', e.target.value)}
                                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                            >
                                <option value="weight">Weight (lb)</option>
                                <option value="value">Value ($)</option>
                                <option value="dest_state">Dest State</option>
                                <option value="carrier">Requested Carrier</option>
                            </select>

                            <select
                                value={rule.condition.op}
                                onChange={(e) => updateRule(index, 'condition.op', e.target.value)}
                                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono"
                            >
                                <option value="eq">==</option>
                                <option value="neq">!=</option>
                                <option value="gt">&gt;</option>
                                <option value="lt">&lt;</option>
                                <option value="contains">Contains</option>
                            </select>

                            <input
                                type={['weight', 'value'].includes(rule.condition.field) ? 'number' : 'text'}
                                value={rule.condition.value}
                                onChange={(e) => updateRule(index, 'condition.value', e.target.value)}
                                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs w-24"
                                placeholder="Value"
                            />
                        </div>

                        <ArrowRight className="w-5 h-5 text-slate-300" />

                        {/* Action Block */}
                        <div className="flex-1 bg-indigo-50 rounded-lg p-2 border border-indigo-100 flex items-center gap-2 text-sm">
                            <span className="font-bold text-indigo-500 text-xs uppercase px-1">THEN</span>
                            <select
                                value={rule.action.type}
                                onChange={(e) => updateRule(index, 'action.type', e.target.value)}
                                className="bg-white border border-indigo-200 rounded px-2 py-1 text-xs"
                            >
                                <option value="SET_CARRIER">Set Carrier</option>
                                <option value="ADD_SERVICE">Add Service</option>
                                <option value="HOLD">Flag for Review</option>
                            </select>

                            <input
                                type="text"
                                value={rule.action.value}
                                onChange={(e) => updateRule(index, 'action.value', e.target.value)}
                                className="bg-white border border-indigo-200 rounded px-2 py-1 text-xs flex-1"
                                placeholder="Value (e.g. UPS)"
                            />
                        </div>

                        {/* Delete */}
                        <button
                            onClick={() => removeRule(index)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}

                <button
                    onClick={addRule}
                    className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-primary-400 hover:text-primary-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 font-medium"
                >
                    <Plus className="w-5 h-5" />
                    Add New Rule
                </button>
            </div>
        </div>
    );
}
