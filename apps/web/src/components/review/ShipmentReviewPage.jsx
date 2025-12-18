import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DocumentReview from './DocumentReview';
import { api } from '../../services/api';
import { CheckCircle, Truck, Package, XCircle, AlertCircle } from 'lucide-react';

export default function ShipmentReviewPage({ user }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const [document, setDocument] = useState(null);
    const [viewMode, setViewMode] = useState('internal'); // 'internal' | 'client'

    // ... existing code ...

    return (
        <div className="flex flex-col h-screen">
            {/* Status Bar */}
            <div className={`text-white px-6 py-3 flex justify-between items-center shadow-md z-20 transition-colors duration-300
                ${viewMode === 'client' ? 'bg-indigo-900' : 'bg-slate-900'}`}>
                <div className="flex items-center gap-4">
                    <span className="text-white/60 text-sm font-medium uppercase tracking-wider">Status</span>
                    <span className={`px-2 py-0.5 rounded text-sm font-bold bg-white/10`}>
                        {document.status?.toUpperCase()}
                    </span>

                    {/* View Mode Toggle */}
                    <div className="bg-black/20 p-1 rounded-lg flex gap-1 ml-4">
                        <button
                            onClick={() => setViewMode('internal')}
                            className={`px-3 py-1 text-xs font-semibold rounded transition-all
                                ${viewMode === 'internal' ? 'bg-white/20 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
                        >
                            Internal
                        </button>
                        <button
                            onClick={() => setViewMode('client')}
                            className={`px-3 py-1 text-xs font-semibold rounded transition-all
                                ${viewMode === 'client' ? 'bg-white/20 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
                        >
                            Client View
                        </button>
                    </div>
                    {viewMode === 'client' && <span className="text-xs text-indigo-200 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                        External Sharing Mode
                    </span>}
                </div>
                <div className="flex gap-3">
                    {/* Only show implementation actions in Internal Mode */}
                    {viewMode === 'internal' && (
                        <>
                            {document.status === 'draft' && (
                                <button
                                    onClick={() => updateStatus('ready_to_book')}
                                    className="btn bg-emerald-600 hover:bg-emerald-500 text-white border-none flex items-center gap-2 px-3 py-1.5 rounded text-sm"
                                >
                                    <CheckCircle className="w-4 h-4" /> Mark Ready to Book
                                </button>
                            )}
                            {(document.status === 'ready_to_book' || document.status === 'draft') && (
                                <button
                                    onClick={() => updateStatus('booked')}
                                    className="btn bg-blue-600 hover:bg-blue-500 text-white border-none flex items-center gap-2 px-3 py-1.5 rounded text-sm"
                                >
                                    <Package className="w-4 h-4" /> Mark Booked
                                </button>
                            )}
                            {document.status === 'booked' && (
                                <button
                                    onClick={() => updateStatus('in_transit')}
                                    className="btn bg-purple-600 hover:bg-purple-500 text-white border-none flex items-center gap-2 px-3 py-1.5 rounded text-sm"
                                >
                                    <Truck className="w-4 h-4" /> Mark In Transit
                                </button>
                            )}
                            <button
                                onClick={() => updateStatus('exception')}
                                className="btn bg-red-900/50 hover:bg-red-800 text-red-200 border-none flex items-center gap-2 px-3 py-1.5 rounded text-sm"
                            >
                                <AlertCircle className="w-4 h-4" /> Flag Exception
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden">
                <DocumentReview
                    document={{ ...document, isShipment: true }}
                    user={user}
                    viewMode={viewMode}
                    onBack={() => navigate('/import')}
                    onGenerate={async (type) => api.generateDocument(id, type)}
                    onSave={handleSave}
                />
            </div>
        </div>
    );
}
