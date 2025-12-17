import { useState, useEffect } from 'react';
import { Plus, CheckCircle, Truck } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AccountManager() {
    const [accounts, setAccounts] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        provider: 'fedex',
        accountNumber: '',
        apiKey: '',
        secretKey: ''
    });

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/carriers/accounts', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setAccounts(data.data || []);
        } catch (error) {
            console.error('Failed to load accounts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/carriers/accounts', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    provider: formData.provider,
                    accountNumber: formData.accountNumber,
                    credentials: {
                        apiKey: formData.apiKey,
                        secretKey: formData.secretKey
                    }
                })
            });

            if (res.ok) {
                setShowForm(false);
                setFormData({ provider: 'fedex', accountNumber: '', apiKey: '', secretKey: '' });
                loadAccounts();
            } else {
                alert('Failed to add account');
            }
        } catch (error) {
            console.error('Failed to add account:', error);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-purple-600" />
                    Carrier Accounts
                </h2>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="btn-secondary text-sm flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Add Account
                </button>
            </div>

            {showForm && (
                <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200"
                    onSubmit={handleSubmit}
                >
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
                            <select
                                value={formData.provider}
                                onChange={e => setFormData({ ...formData, provider: e.target.value })}
                                className="input-field"
                            >
                                <option value="fedex">FedEx</option>
                                <option value="ups">UPS</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Account Number</label>
                            <input
                                type="text"
                                value={formData.accountNumber}
                                onChange={e => setFormData({ ...formData, accountNumber: e.target.value })}
                                className="input-field"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">API Key / Client ID</label>
                            <input
                                type="password"
                                value={formData.apiKey}
                                onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                                className="input-field"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Secret Key</label>
                            <input
                                type="password"
                                value={formData.secretKey}
                                onChange={e => setFormData({ ...formData, secretKey: e.target.value })}
                                className="input-field"
                                required
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                        <button type="submit" className="btn-primary">Connect Account</button>
                    </div>
                </motion.form>
            )}

            <div className="space-y-3">
                {loading ? (
                    <div className="text-center text-slate-500 py-4">Loading accounts...</div>
                ) : accounts.length === 0 ? (
                    <div className="text-center text-slate-500 py-4">No carrier accounts connected</div>
                ) : (
                    accounts.map(account => (
                        <div key={account.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${account.provider === 'fedex' ? 'bg-purple-600' : 'bg-yellow-600'
                                    }`}>
                                    {account.provider === 'fedex' ? 'Fx' : 'UPS'}
                                </div>
                                <div>
                                    <h3 className="font-medium text-slate-900 capitalize">{account.provider}</h3>
                                    <p className="text-sm text-slate-500">Acct: •••• {account.accountNumber.slice(-4)}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                                    <CheckCircle className="w-3 h-3" />
                                    Active
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
