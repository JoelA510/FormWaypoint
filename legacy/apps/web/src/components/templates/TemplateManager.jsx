import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Star, Trash2, FileText } from 'lucide-react';

export default function TemplateManager({ onTemplateApply, onClose }) {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/templates', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setTemplates(data.data || []);
        } catch (error) {
            console.error('Failed to load templates:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleApplyTemplate = async (templateId) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/templates/${templateId}/apply`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const document = await res.json();
            if (onTemplateApply) onTemplateApply(document);
            if (onClose) onClose();
        } catch (error) {
            console.error('Failed to apply template:', error);
        }
    };

    const handleDeleteTemplate = async (templateId) => {
        if (!confirm('Delete this template?')) return;

        try {
            const token = localStorage.getItem('token');
            await fetch(`/templates/${templateId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            loadTemplates();
        } catch (error) {
            console.error('Failed to delete template:', error);
        }
    };

    const handleSetDefault = async (templateId) => {
        try {
            const token = localStorage.getItem('token');
            await fetch(`/templates/${templateId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isDefault: true })
            });
            loadTemplates();
        } catch (error) {
            console.error('Failed to set default:', error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
            >
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white flex justify-between items-center">
                    <h2 className="text-2xl font-bold">Document Templates</h2>
                    <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
                    {loading ? (
                        <div className="text-center py-12 text-gray-500">Loading templates...</div>
                    ) : templates.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                            <p className="text-gray-500 mb-4">No templates yet</p>
                            <button
                                onClick={() => alert('Create functionality coming soon')}
                                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-lg hover:shadow-lg transition"
                            >
                                <Plus className="w-5 h-5 inline mr-2" />
                                Create Your First Template
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {templates.map(template => (
                                <motion.div
                                    key={template.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="border border-gray-200 rounded-xl p-4 hover:shadow-lg transition group"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold text-lg">{template.name}</h3>
                                                {template.isDefault && (
                                                    <Star className="w-5 h-5 text-yellow-500 fill-current" />
                                                )}
                                            </div>
                                            {template.description && (
                                                <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                                            )}
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                                            {!template.isDefault && (
                                                <button
                                                    onClick={() => handleSetDefault(template.id)}
                                                    className="text-gray-400 hover:text-yellow-500 p-1"
                                                    title="Set as default"
                                                >
                                                    <Star className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteTemplate(template.id)}
                                                className="text-gray-400 hover:text-red-500 p-1"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm">
                                        <div className="text-gray-600">
                                            <span className="font-medium">Shipper:</span> {template.header?.shipper || 'N/A'}
                                        </div>
                                        <div className="text-gray-600">
                                            <span className="font-medium">Consignee:</span> {template.header?.consignee || 'N/A'}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleApplyTemplate(template.id)}
                                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-2 rounded-lg hover:shadow-lg transition"
                                    >
                                        Use This Template
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
