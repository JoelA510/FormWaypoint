import { useState, useEffect } from 'react';
import { Search, MapPin, X } from 'lucide-react';
import { api } from '../../services/api';

export default function PartySelector({ isOpen, onClose, onSelect }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [parties, setParties] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadParties();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, searchTerm]);

    const loadParties = async () => {
        setLoading(true);
        try {
            const res = await api.getParties({ search: searchTerm });
            setParties(res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-900">Select from Address Book</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search contacts..."
                            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="text-center py-8 text-slate-400">Loading...</div>
                    ) : parties.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">No contacts found</div>
                    ) : (
                        <div className="space-y-1">
                            {parties.map(party => (
                                <button
                                    key={party.id}
                                    onClick={() => onSelect(party)}
                                    className="w-full text-left p-3 hover:bg-slate-50 rounded-lg group transition-colors"
                                >
                                    <div className="font-medium text-slate-900 group-hover:text-indigo-700">
                                        {party.name}
                                    </div>
                                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                        <MapPin className="w-3 h-3" />
                                        <span className="truncate">
                                            {party.city}, {party.countryCode}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
