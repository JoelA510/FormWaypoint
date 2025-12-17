import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Plus, Search, Edit2, Trash2, MapPin, Phone, Mail } from 'lucide-react';
import PartyModal from './PartyModal'; // We'll create this next

export default function AddressBookPage() {
    const [parties, setParties] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedParty, setSelectedParty] = useState(null);

    useEffect(() => {
        loadParties();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm]);

    const loadParties = async () => {
        setIsLoading(true);
        try {
            const result = await api.getParties({ search: searchTerm });
            setParties(result.data);
        } catch (error) {
            console.error('Failed to load parties:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = () => {
        setSelectedParty(null);
        setIsModalOpen(true);
    };

    const handleEdit = (party) => {
        setSelectedParty(party);
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this contact?')) return;
        try {
            await api.deleteParty(id);
            loadParties();
        } catch (error) {
            alert('Failed to delete party: ' + error.message);
        }
    };

    const handleSave = async (data) => {
        try {
            if (selectedParty) {
                await api.updateParty(selectedParty.id, data);
            } else {
                await api.createParty(data);
            }
            setIsModalOpen(false);
            loadParties();
        } catch (error) {
            console.error('Save failed:', error);
            throw error; // Re-throw to let modal handle error display
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Address Book</h1>
                    <p className="mt-1 text-sm text-slate-500">Manage your frequent shippers and consignees.</p>
                </div>
                <button
                    onClick={handleCreate}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Add Contact
                </button>
            </div>

            {/* Search */}
            <div className="mb-6 relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search by name, city, or country..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none"
                />
            </div>

            {/* List */}
            {isLoading ? (
                <div className="text-center py-12 text-slate-400">Loading contacts...</div>
            ) : parties.length === 0 ? (
                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                    <MapPin className="w-8 h-8 mx-auto mb-3 text-slate-400" />
                    <p>No contacts found.</p>
                    {searchTerm && <button onClick={() => setSearchTerm('')} className="text-indigo-600 mt-2 hover:underline">Clear search</button>}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {parties.map((party) => (
                        <div key={party.id} className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="font-semibold text-lg text-slate-900 line-clamp-1">{party.name}</h3>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEdit(party)} className="p-1 text-slate-400 hover:text-indigo-600 rounded">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(party.id)} className="p-1 text-slate-400 hover:text-red-600 rounded">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm text-slate-600">
                                <div className="flex items-start gap-2">
                                    <MapPin className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                                    <div>
                                        <div>{party.addressLine1}</div>
                                        {party.addressLine2 && <div>{party.addressLine2}</div>}
                                        <div>{party.city}, {party.stateOrProvince} {party.postalCode}</div>
                                        <div className="font-medium text-slate-900">{party.countryCode}</div>
                                    </div>
                                </div>
                                {(party.contactName || party.phone || party.email) && (
                                    <div className="pt-3 mt-3 border-t border-slate-100 space-y-1">
                                        {party.contactName && <div className="font-medium text-slate-900">{party.contactName}</div>}
                                        {party.email && (
                                            <div className="flex items-center gap-2">
                                                <Mail className="w-3 h-3 text-slate-400" />
                                                <a href={`mailto:${party.email}`} className="hover:text-indigo-600">{party.email}</a>
                                            </div>
                                        )}
                                        {party.phone && (
                                            <div className="flex items-center gap-2">
                                                <Phone className="w-3 h-3 text-slate-400" />
                                                {party.phone}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isModalOpen && (
                <PartyModal
                    key={selectedParty?.id || 'new'}
                    party={selectedParty}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}
