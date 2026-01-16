import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useDebounce } from '../../hooks/useDebounce';
import { Plus, Search, Package, Edit2, Trash2 } from 'lucide-react';
import ProductModal from './ProductModal';

export default function ProductLibraryPage() {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 500);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    useEffect(() => {
        loadItems();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearchTerm]);

    const loadItems = async () => {
        setIsLoading(true);
        try {
            const result = await api.getItems({ search: debouncedSearchTerm });
            setItems(result.data);
        } catch (error) {
            console.error('Failed to load items:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = () => {
        setSelectedItem(null);
        setIsModalOpen(true);
    };

    const handleEdit = (item) => {
        setSelectedItem(item);
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this product?')) return;
        try {
            await api.deleteItem(id);
            loadItems();
        } catch (error) {
            alert('Failed to delete item: ' + error.message);
        }
    };

    const handleSave = async (data) => {
        try {
            if (selectedItem) {
                await api.updateItem(selectedItem.id, data);
            } else {
                await api.createItem(data);
            }
            setIsModalOpen(false);
            loadItems();
        } catch (error) {
            console.error('Save failed:', error);
            throw error; // Let modal handle error
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Product Library</h1>
                    <p className="mt-1 text-sm text-slate-500">Manage your product catalog for quick access.</p>
                </div>
                <button
                    onClick={handleCreate}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Add Product
                </button>
            </div>

            {/* Search */}
            <div className="mb-6 relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search by SKU, description, or HTS..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                />
            </div>

            {/* List */}
            {isLoading ? (
                <div className="text-center py-12 text-slate-400">Loading products...</div>
            ) : items.length === 0 ? (
                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                    <Package className="w-8 h-8 mx-auto mb-3 text-slate-400" />
                    <p>No products found.</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                            <tr>
                                <th className="p-4">SKU</th>
                                <th className="p-4">Description</th>
                                <th className="p-4">HTS Code</th>
                                <th className="p-4">Origin</th>
                                <th className="p-4 text-right">Value</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 font-medium text-slate-900">{item.sku}</td>
                                    <td className="p-4 text-slate-600 max-w-md truncate">{item.description}</td>
                                    <td className="p-4 text-slate-600">{item.htsCode || '-'}</td>
                                    <td className="p-4 text-slate-600">{item.countryOfOrigin || '-'}</td>
                                    <td className="p-4 text-right text-slate-600">
                                        {item.defaultUnitValue ? `$${item.defaultUnitValue.toFixed(2)}` : '-'}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => handleEdit(item)} className="p-1 text-slate-400 hover:text-indigo-600 rounded">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(item.id)} className="p-1 text-slate-400 hover:text-red-600 rounded">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <ProductModal
                    key={selectedItem?.id || 'new'}
                    item={selectedItem}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}
