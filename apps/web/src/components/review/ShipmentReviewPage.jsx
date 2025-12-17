import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DocumentReview from './DocumentReview';
import { api } from '../../services/api';
import { CheckCircle, Truck, Package, XCircle, AlertCircle } from 'lucide-react';

export default function ShipmentReviewPage({ user }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const [document, setDocument] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (id) {
            fetchShipment(id);
        }
    }, [id]);

    const fetchShipment = async (shipmentId) => {
        try {
            const shipment = await api.getShipment(shipmentId);
            const validation = await api.getValidation(shipmentId);

            const adapter = (s) => {
                const head = {
                    ...s,
                    shipper: s.shipperSnapshot ? JSON.parse(s.shipperSnapshot) : undefined,
                    consignee: s.consigneeSnapshot ? JSON.parse(s.consigneeSnapshot) : undefined,
                    forwarder: s.forwarderSnapshot ? JSON.parse(s.forwarderSnapshot) : undefined,
                    broker: s.brokerSnapshot ? JSON.parse(s.brokerSnapshot) : undefined,
                };

                const lines = (s.lineItems || []).map(l => ({
                    ...l,
                    valueUsd: l.unitValue
                }));

                return {
                    id: s.id,
                    status: s.status || 'draft',
                    carrierCode: s.carrierCode,
                    trackingNumber: s.trackingNumber,
                    header: head,
                    lines: lines,
                    meta: {
                        validation: validation.issues?.map((issue) => ({
                            lineIndex: -1,
                            message: issue.message,
                            field: issue.path || issue.code,
                            value: issue.severity
                        })) || []
                    },
                    references: []
                };
            };

            setDocument(adapter(shipment));
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (doc) => {
        // Map document structure back to API payload
        const payload = {
            incoterm: doc.header.incoterm,
            currency: doc.header.currency,
            // Re-calculated totals if needed, or trust API to handle
            // Party updates are complex via snapshot, but API PUT allows ref updates
            // For now, we mainly sync specific editable fields
        };

        await api.updateShipment(doc.id, payload);
    };

    const updateStatus = async (newStatus) => {
        if (!confirm(`Change status to ${newStatus}?`)) return;
        try {
            await api.updateShipment(id, { status: newStatus });
            await fetchShipment(id); // Reload
        } catch (e) {
            alert('Failed to update status: ' + e.message);
        }
    };

    if (loading) return <div className="text-center py-12">Loading shipment...</div>;
    if (error) return <div className="text-center py-12 text-red-600">Error: {error}</div>;
    if (!document) return <div className="text-center py-12">Shipment not found</div>;

    return (
        <div className="flex flex-col h-screen">
            {/* Status Bar */}
            <div className="bg-slate-900 text-white px-6 py-3 flex justify-between items-center shadow-md z-20">
                <div className="flex items-center gap-4">
                    <span className="text-slate-400 text-sm font-medium uppercase tracking-wider">Status</span>
                    <span className={`px-2 py-0.5 rounded text-sm font-bold bg-white/10`}>
                        {document.status?.toUpperCase()}
                    </span>
                </div>
                <div className="flex gap-3">
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
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden">
                <DocumentReview
                    document={{ ...document, isShipment: true }}
                    user={user}
                    onBack={() => navigate('/import')}
                    onGenerate={async (type) => api.generateDocument(id, type)}
                    onSave={handleSave}
                />
            </div>
        </div>
    );
}
