import { useState } from 'react';
import { X } from 'lucide-react';

export default function ProductModal({ item, isOpen, onClose, onSave }) {
    const [formData, setFormData] = useState({
        sku: item?.sku || '',
        description: item?.description || '',
        htsCode: item?.htsCode || '',
        countryOfOrigin: item?.countryOfOrigin || '',
        eccn: item?.eccn || '',
        defaultUnitValue: item?.defaultUnitValue || '',
        defaultNetWeightKg: item?.defaultNetWeightKg || '',
        uom: item?.uom || 'EA'
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            await onSave({
                ...formData,
                defaultUnitValue: formData.defaultUnitValue ? parseFloat(formData.defaultUnitValue) : null,
                defaultNetWeightKg: formData.defaultNetWeightKg ? parseFloat(formData.defaultNetWeightKg) : null
            });
        } catch (err) {
            setError(err.message || 'Failed to save product');
            setIsSaving(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b border-slate-100">
                    <h2 className="text-xl font-semibold text-slate-900">
                        {item ? 'Edit Product' : 'New Product'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">SKU *</label>
                            <input
                                required
                                name="sku"
                                value={formData.sku}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">UOM</label>
                            <input
                                name="uom"
                                value={formData.uom}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
                        <textarea
                            required
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={3}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">HTS Code</label>
                            <input
                                name="htsCode"
                                value={formData.htsCode}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Origin (ISO)</label>
                            <input
                                name="countryOfOrigin"
                                value={formData.countryOfOrigin}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 hover:text-slate-800"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {isSaving ? 'Saving...' : 'Save Product'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
