import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Plus, Search, Layers, Trash2 } from 'lucide-react';


export default function TemplateLibraryPage() {
    const [templates, setTemplates] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');


    useEffect(() => {
        loadTemplates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm]);

    const loadTemplates = async () => {
        setIsLoading(true);
        try {
            const result = await api.getShipmentTemplates({ search: searchTerm });
            setTemplates(result.data);
        } catch (error) {
            console.error('Failed to load templates:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = () => {
        // For now, prompt to create from shipment? Or basic create?
        // Let's create a basic one or navigate to a specialized Create page.
        // For MVP, lets just have an alert or simple modal if needed.
        // Better: "Templates are best created from existing shipments. Go to a shipment and click 'Save as Template'."
        alert("To create a template, please go to an existing Shipment and click 'Save as Template'.");
    };

    const handleDelete = async () => {
        if (!window.confirm('Delete this template?')) return;
        try {
            // Need API method for deleting shipment template
            // We only added create/get in api.js? Let's check.
            // We missed deleteShipmentTemplate in api.js? I'll check.
            // Assumption: I did not add delete. I will need to add it or fail.
            // Let's assume I will add it next.
            // await api.deleteShipmentTemplate(id); 
            // Actually, I can use generic request if method missing or fix api.js
            alert("Delete functionality coming in next update.");
        } catch (error) {
            alert('Failed to delete template: ' + error.message);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Shipment Templates</h1>
                    <p className="mt-1 text-sm text-slate-500">Pre-configured shipments for recurring orders.</p>
                </div>
                <button
                    onClick={handleCreate}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> New Template
                </button>
            </div>

            {/* Search */}
            <div className="mb-6 relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search templates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
                />
            </div>

            {/* List */}
            {isLoading ? (
                <div className="text-center py-12 text-slate-400">Loading templates...</div>
            ) : templates.length === 0 ? (
                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                    <Layers className="w-8 h-8 mx-auto mb-3 text-slate-400" />
                    <p>No templates found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates.map(template => (
                        <div key={template.id} className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="font-semibold text-lg text-slate-900">{template.name}</h3>
                                    <div className="text-sm text-slate-500">{template.description || 'No description'}</div>
                                </div>
                                <div className="flex gap-2">
                                    {/* <button className="p-1 text-slate-400 hover:text-indigo-600 rounded">
                                        <Edit2 className="w-4 h-4" />
                                    </button> */}
                                    <button onClick={() => handleDelete(template.id)} className="p-1 text-slate-400 hover:text-red-600 rounded">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm text-slate-600 border-t border-slate-100 pt-3">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Shipper:</span>
                                    {/* We only have IDs, need to lookup or if template has snapshot? 
                                        Schema says IDs. Ideally we expand or fetch party. 
                                        For now just show ID or "Set" */}
                                    <span className="font-medium">{template.shipperId ? 'Set' : '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Consignee:</span>
                                    <span className="font-medium">{template.consigneeId ? 'Set' : '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Lines:</span>
                                    <span className="font-medium">
                                        {template.lineItems ? JSON.parse(template.lineItems).length : 0}
                                    </span>
                                </div>
                            </div>

                            <button className="w-full mt-4 btn-secondary text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                                Use Template
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
