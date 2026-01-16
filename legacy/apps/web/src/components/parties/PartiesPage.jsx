import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, X, Phone, Mail, Building } from 'lucide-react';
import { api } from '../../services/api';

const PartyModal = ({ party, isOpen, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        name: party?.name || '',
        addressLine1: party?.addressLine1 || '',
        addressLine2: party?.addressLine2 || '',
        city: party?.city || '',
        stateOrProvince: party?.stateOrProvince || '',
        postalCode: party?.postalCode || '',
        countryCode: party?.countryCode || '',
        contactName: party?.contactName || '',
        phone: party?.phone || '',
        email: party?.email || '',
        taxIdOrEori: party?.taxIdOrEori || ''
    });

    if (!isOpen) return null;

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-xl font-bold text-slate-900">
                        {party ? 'Edit Party' : 'New Party'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Basic Info */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
                            <div className="relative">
                                <Building className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                    className="pl-10 w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    placeholder="Acme Corp"
                                />
                            </div>
                        </div>

                        {/* Address */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 1 *</label>
                            <input
                                type="text"
                                name="addressLine1"
                                required
                                value={formData.addressLine1}
                                onChange={handleChange}
                                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 2</label>
                            <input
                                type="text"
                                name="addressLine2"
                                value={formData.addressLine2 || ''}
                                onChange={handleChange}
                                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">City *</label>
                            <input
                                type="text"
                                name="city"
                                required
                                value={formData.city}
                                onChange={handleChange}
                                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">State / Province</label>
                            <input
                                type="text"
                                name="stateOrProvince"
                                value={formData.stateOrProvince || ''}
                                onChange={handleChange}
                                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Postal Code *</label>
                            <input
                                type="text"
                                name="postalCode"
                                required
                                value={formData.postalCode}
                                onChange={handleChange}
                                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Country Code (ISO) *</label>
                            <input
                                type="text"
                                name="countryCode"
                                required
                                maxLength={2}
                                value={formData.countryCode}
                                onChange={(e) => setFormData({ ...formData, countryCode: e.target.value.toUpperCase() })}
                                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="US"
                            />
                        </div>

                        {/* Contact */}
                        <div className="md:col-span-2 border-t pt-4 mt-2">
                            <h3 className="text-sm font-semibold text-slate-900 mb-4">Contact & Tax Info</h3>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
                            <input
                                type="text"
                                name="contactName"
                                value={formData.contactName || ''}
                                onChange={handleChange}
                                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Tax ID / EORI</label>
                            <input
                                type="text"
                                name="taxIdOrEori"
                                value={formData.taxIdOrEori || ''}
                                onChange={handleChange}
                                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                                <input
                                    type="text"
                                    name="phone"
                                    value={formData.phone || ''}
                                    onChange={handleChange}
                                    className="pl-10 w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email || ''}
                                    onChange={handleChange}
                                    className="pl-10 w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                        >
                            {party ? 'Update Party' : 'Create Party'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const PartiesPage = () => {
    const [parties, setParties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingParty, setEditingParty] = useState(null);

    const fetchParties = async () => {
        try {
            setLoading(true);
            const res = await api.getParties(search);
            // Handle { data: [...] } structure
            setParties(res.data || []);
        } catch (error) {
            console.error('Failed to fetch parties:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchParties();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]); // Re-fetch on search change

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this party?')) {
            try {
                await api.deleteParty(id);
                fetchParties();
            } catch (error) {
                alert('Failed to delete party (it may be in use).');
            }
        }
    };

    const handleSave = async (data) => {
        try {
            if (editingParty) {
                await api.updateParty(editingParty.id, data);
            } else {
                await api.createParty(data);
            }
            setIsModalOpen(false);
            fetchParties();
        } catch (error) {
            alert('Failed to save party: ' + error.message);
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Address Book</h1>
                    <p className="text-slate-500">Manage shippers, consignees, and other parties.</p>
                </div>
                <button
                    onClick={() => { setEditingParty(null); setIsModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                >
                    <Plus className="w-5 h-5" />
                    New Party
                </button>
            </div>

            {/* Search */}
            <div className="mb-6">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search parties..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 w-full rounded-lg border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className="text-center py-12 text-slate-500">Loading parties...</div>
            ) : parties.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Building className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900 mb-1">No parties found</h3>
                    <p className="text-slate-500">Get started by creating a new party to use in shipments.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Company</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Location</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Contact</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {parties.map((party) => (
                                <tr key={party.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-slate-900">{party.name}</div>
                                        {party.taxIdOrEori && <div className="text-xs text-slate-500">ID: {party.taxIdOrEori}</div>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-slate-900">{party.city}, {party.countryCode}</div>
                                        <div className="text-xs text-slate-500 truncate max-w-xs">{party.addressLine1}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-slate-900">{party.contactName || '-'}</div>
                                        <div className="text-xs text-slate-500">{party.email}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => { setEditingParty(party); setIsModalOpen(true); }}
                                            className="text-primary-600 hover:text-primary-900 mr-4"
                                            title="Edit"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(party.id)}
                                            className="text-red-600 hover:text-red-900"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <PartyModal
                key={editingParty?.id || 'new'}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                party={editingParty}
            />
        </div>
    );
};

export default PartiesPage;
