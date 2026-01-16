import { useState } from 'react';
import { Save, ArrowLeft, Edit2, AlertTriangle, X, Plus, Trash2, BookmarkPlus, Download } from 'lucide-react';
import { api, API_URL } from '../../services/api';
import EditableField from '../common/EditableField';
import PartySelector from '../common/PartySelector';
import Comments from './Comments';
import History from './History';
import CarrierRatePanel from './CarrierRatePanel';
import ForwarderBookingPanel from './ForwarderBookingPanel';
import AesPanel from './AesPanel';
import SanctionsPanel from './SanctionsPanel';
import ProfitabilityCard from './ProfitabilityCard';
import FeatureGuard from '../common/FeatureGuard';

export default function DocumentReview({ document, onBack, user, onGenerate, onSave: customSave, viewMode = 'internal' }) {
    const [doc, setDoc] = useState(document);
    const [isEditing, setIsEditing] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [message, setMessage] = useState(null);
    const [newRefType, setNewRefType] = useState('PO');
    const [newRefValue, setNewRefValue] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('sli');

    const [selectedRateCost, setSelectedRateCost] = useState(0);

    // Default revenue to the sum of line items value
    const totalValue = (doc.lines || []).reduce((acc, line) => acc + (parseFloat(line.valueUsd) || 0), 0);
    const [revenue, setRevenue] = useState(doc.header?.revenue || totalValue);

    // Save revenue to doc header when it changes
    const handleRevenueChange = (newVal) => {
        setRevenue(newVal);
        setDoc(prev => ({
            ...prev,
            header: { ...prev.header, revenue: newVal }
        }));
    };

    const { header, lines, meta } = doc;
    const validationErrors = meta.validation || [];

    const handleHeaderChange = (field, value) => {
        setDoc(prev => ({
            ...prev,
            header: { ...prev.header, [field]: value }
        }));
    };

    const handleLineChange = (index, field, value) => {
        setDoc(prev => {
            const newLines = [...prev.lines];
            newLines[index] = { ...newLines[index], [field]: value };
            return { ...prev, lines: newLines };
        });
    };

    const handleAddressChange = (type, field, value) => {
        setDoc(prev => ({
            ...prev,
            header: {
                ...prev.header,
                [type]: {
                    ...prev.header[type],
                    [field]: value
                }
            }
        }));
    };

    const handleAddReference = () => {
        if (!newRefValue) return;
        const newRef = { type: newRefType, value: newRefValue };
        const updatedDoc = {
            ...doc,
            references: [...(doc.references || []), newRef]
        };
        setDoc(updatedDoc);
        setNewRefValue('');
    };

    const handleRemoveReference = (index) => {
        const updatedRefs = [...(doc.references || [])];
        updatedRefs.splice(index, 1);
        setDoc({ ...doc, references: updatedRefs });
    };

    const handleDismiss = async (code) => {
        if (!doc.isShipment) return;
        try {
            await api.dismissIssue(doc.id, [code]);
            // Optimistically update UI
            setDoc(prev => ({
                ...prev,
                meta: {
                    ...prev.meta,
                    validation: prev.meta.validation.filter(v => v.code !== code)
                }
            }));
        } catch (err) {
            console.error(err);
            alert('Failed to dismiss issue');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);
        try {
            if (customSave) {
                await customSave(doc);
            } else {
                await api.updateDocument(doc.id, doc);
            }
            setIsEditing(false);
            setMessage({ type: 'success', text: 'Changes saved successfully' });
        } catch (err) {
            setMessage({ type: 'error', text: `Save failed: ${err.message}` });
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        setMessage(null);
        try {
            let response;
            if (doc.isShipment && typeof onGenerate === 'function') {
                response = await onGenerate(selectedTemplate);
            } else {
                response = await api.triggerExport(doc.id, 'sli', selectedTemplate);
            }

            if (response && response.url) {
                const fullUrl = `${API_URL}${response.url}`;
                window.open(fullUrl, '_blank');
                setMessage({ type: 'success', text: 'Export complete. Download should begin shortly.' });
            } else {
                throw new Error('No download URL returned');
            }
        } catch (err) {
            setMessage({ type: 'error', text: `Export failed: ${err.message}` });
        } finally {
            setIsExporting(false);
        }
    };

    // Address Block Component
    const AddressBlock = ({ title, data, isEditing, onChange }) => {
        const [isSelectorOpen, setIsSelectorOpen] = useState(false);
        const [isExpanded, setIsExpanded] = useState(false);

        const handleSelectParty = (party) => {
            onChange('name', party.name);
            onChange('address', party.addressLine1);
            onChange('address2', party.addressLine2 || '');
            onChange('city', party.city);
            onChange('state', party.stateOrProvince || '');
            onChange('zip', party.postalCode);
            onChange('country', party.countryCode);
            onChange('partyId', party.id);
            setIsSelectorOpen(false);
            setIsExpanded(false); // Collapse after selection
        };

        // If no data object, simple implementation
        if (!data || typeof data !== 'object') {
            return (
                <div className="relative">
                    <EditableField
                        label={title}
                        value={data || ''}
                        isEditing={isEditing}
                        onChange={(v) => onChange('name', v)}
                    />
                    {isEditing && (
                        <div className="absolute top-0 right-0">
                            <button
                                onClick={() => setIsSelectorOpen(true)}
                                className="text-xs text-primary-600 hover:text-primary-800 underline"
                            >
                                Address Book
                            </button>
                        </div>
                    )}
                    <PartySelector
                        isOpen={isSelectorOpen}
                        onClose={() => setIsSelectorOpen(false)}
                        onSelect={handleSelectParty}
                    />
                </div>
            );
        }

        const isValidAddress = data.name && data.city && data.country;
        // In "Global Edit Mode", we still want to collapse the valid addresses to reduce noise
        // Show expanded if it's invalid OR if explicitly expanded
        const showForm = isEditing && (isExpanded || !isValidAddress);

        return (
            <div className={`space-y-3 border transition-colors rounded-lg relative ${showForm ? 'p-4 border-slate-200 bg-slate-50' : 'p-3 border-transparent hover:bg-slate-50'}`}>
                <div className="flex justify-between items-start">
                    <h4 className="font-medium text-slate-700 text-sm flex items-center gap-2 mb-1">
                        {title}
                        {isEditing && !showForm && (
                            <button
                                onClick={() => setIsExpanded(true)}
                                className="text-xs text-primary-600 hover:text-primary-700 font-normal ml-2 flex items-center gap-1"
                            >
                                <Edit2 className="w-3 h-3" /> Edit
                            </button>
                        )}
                    </h4>

                    {!showForm && isEditing && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsSelectorOpen(true)}
                                className="text-xs text-slate-500 hover:text-primary-600 underline"
                            >
                                Change
                            </button>
                        </div>
                    )}
                </div>

                {/* Summary Card View */}
                {!showForm && (
                    <div className="text-sm text-slate-900">
                        <div className="font-medium">{data.name || 'No Name'}</div>
                        <div className="text-slate-500 whitespace-pre-line">
                            {data.address || ''} {data.address2 ? `\n${data.address2}` : ''}
                            {data.address || data.address2 ? `\n` : ''}
                            {data.city}{data.state ? `, ${data.state}` : ''} {data.zip}
                            {data.country ? `\n${data.country}` : ''}
                        </div>
                    </div>
                )}

                {/* Edit Form View */}
                {showForm && (
                    <>
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex justify-end gap-2 mb-2">
                                <button
                                    onClick={() => setIsSelectorOpen(true)}
                                    className="text-xs flex items-center gap-1 text-slate-600 hover:text-primary-600 bg-white border border-slate-200 px-2 py-1 rounded shadow-sm"
                                >
                                    <BookmarkPlus className="w-3 h-3" /> Pick from Book
                                </button>
                                {isValidAddress && (
                                    <button
                                        onClick={() => setIsExpanded(false)}
                                        className="text-xs flex items-center gap-1 text-slate-500 hover:text-slate-700"
                                    >
                                        <X className="w-3 h-3" /> Close
                                    </button>
                                )}
                            </div>

                            <EditableField label="Name" value={data.name} isEditing={true} onChange={(v) => onChange('name', v)} />
                            <EditableField label="Address" value={data.address} isEditing={true} onChange={(v) => onChange('address', v)} />
                            <EditableField label="Address 2" value={data.address2} isEditing={true} onChange={(v) => onChange('address2', v)} />
                            <div className="grid grid-cols-2 gap-3">
                                <EditableField label="City" value={data.city} isEditing={true} onChange={(v) => onChange('city', v)} />
                                <EditableField label="State" value={data.state} isEditing={true} onChange={(v) => onChange('state', v)} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <EditableField label="Zip" value={data.zip} isEditing={true} onChange={(v) => onChange('zip', v)} />
                                <EditableField label="Country" value={data.country} isEditing={true} onChange={(v) => onChange('country', v)} />
                            </div>
                        </div>
                    </>
                )}

                <PartySelector
                    isOpen={isSelectorOpen}
                    onClose={() => setIsSelectorOpen(false)}
                    onSelect={handleSelectParty}
                />
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-12">
            {/* Toolbar */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">
                            {doc.isShipment ? `Shipment ${doc.id.slice(0, 8)}` : doc.filename}
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Hide edit buttons if in Client View (optional, but good practice) */}
                    {isEditing ? (
                        <>
                            <select
                                value={selectedTemplate}
                                onChange={e => setSelectedTemplate(e.target.value)}
                                className="input-field py-1.5 px-3 text-sm w-40"
                            >
                                <option value="commercial_invoice">Commercial Invoice</option>
                                <option value="packing_list">Packing List</option>
                                <option value="sli">SLI</option>
                                <option value="certificate_of_origin">Certificate of Origin</option>
                                <option value="dangerous_goods_declaration">DG Declaration</option>
                            </select>
                            <button
                                onClick={handleExport}
                                disabled={isExporting}
                                className="btn-primary flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
                            >
                                <Download className="w-4 h-4" />
                                {isExporting ? 'Generating...' : 'Generate PDF'}
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="btn-primary flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <div className="h-6 w-px bg-slate-200 mx-1"></div>
                            <button
                                onClick={() => {
                                    if (confirm('Discard unsaved changes?')) {
                                        setDoc(document); // Revert to original prop
                                        setIsEditing(false);
                                    }
                                }}
                                className="text-slate-500 hover:text-red-600 text-sm font-medium px-2"
                            >
                                Discard
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <Edit2 className="w-4 h-4" /> Edit
                        </button>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-8">
                {message && (
                    <div className={`p-4 rounded-lg border mb-6 ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                        {message.text}
                    </div>
                )}

                {validationErrors.length > 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
                        <div className="flex items-center gap-2 mb-2 text-amber-800 font-semibold">
                            <AlertTriangle className="w-5 h-5" />
                            <h3>Validation Issues</h3>
                        </div>
                        <ul className="list-disc pl-5 space-y-2 text-sm text-amber-700">
                            {validationErrors.map((err, i) => (
                                <li key={i} className="flex items-start justify-between gap-2">
                                    <span>
                                        {err.lineIndex !== undefined ? `Line ${err.lineIndex + 1}: ` : ''}
                                        {err.message}
                                        {err.field && ` (${err.field})`}
                                    </span>
                                    {err.code && (
                                        <button onClick={() => handleDismiss(err.code)} className="text-xs underline hover:text-amber-900">
                                            Dismiss
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        {/* Header Details */}
                        <section className="card p-6 bg-white rounded-lg shadow-sm border border-slate-200">
                            <h3 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100">Shipment Details</h3>
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <AddressBlock
                                        title="Shipper"
                                        data={header.shipper}
                                        isEditing={isEditing}
                                        onChange={(field, val) => handleAddressChange('shipper', field, val)}
                                    />
                                    <AddressBlock
                                        title="Consignee"
                                        data={header.consignee}
                                        isEditing={isEditing}
                                        onChange={(field, val) => handleAddressChange('consignee', field, val)}
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <EditableField label="Incoterm" value={header.incoterm} isEditing={isEditing} onChange={(val) => handleHeaderChange('incoterm', val)} />
                                    <EditableField label="Currency" value={header.currency} isEditing={isEditing} onChange={(val) => handleHeaderChange('currency', val)} />
                                </div>
                            </div>
                        </section>

                        {/* References */}
                        <section className="card p-6 bg-white rounded-lg shadow-sm border border-slate-200">
                            <h3 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100">References</h3>
                            <div className="space-y-3 mb-4">
                                {(doc.references || []).map((ref, idx) => (
                                    <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                                        <span className="font-medium text-slate-700 w-24">{ref.type}:</span>
                                        <span className="flex-1 text-slate-900">{ref.value}</span>
                                        {isEditing && (
                                            <button onClick={() => handleRemoveReference(idx)} className="text-red-500 hover:text-red-700 p-1">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {(!doc.references || doc.references.length === 0) && (
                                    <div className="text-slate-400 italic text-sm">No references added</div>
                                )}
                            </div>
                            {isEditing && (doc.references || []).length < 5 && (
                                <div className="flex gap-3 items-end border-t border-slate-100 pt-4 mt-4">
                                    <div className="w-32">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                                        <select
                                            value={newRefType}
                                            onChange={(e) => setNewRefType(e.target.value)}
                                            className="input-field py-1.5 text-sm"
                                        >
                                            <option value="PO">PO</option>
                                            <option value="SO">SO</option>
                                            <option value="Invoice">Invoice</option>
                                            <option value="Shipment">Shipment</option>
                                            <option value="HAWB">HAWB</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Value</label>
                                        <input
                                            type="text"
                                            value={newRefValue}
                                            onChange={(e) => setNewRefValue(e.target.value)}
                                            className="input-field py-1.5 text-sm"
                                            placeholder="Enter number"
                                        />
                                    </div>
                                    <button onClick={handleAddReference} className="btn-secondary py-1.5">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </section>

                        {/* Line Items */}
                        <section className="card p-6 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                            <h3 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100">Line Items</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-3">Description</th>
                                            <th className="px-4 py-3 text-right">Qty</th>
                                            <th className="px-4 py-3 text-right">Weight (kg)</th>
                                            {/* Hide Value column in Client View */}
                                            {viewMode === 'internal' && <th className="px-4 py-3 text-right">Value</th>}
                                            <th className="px-4 py-3">HTS Code</th>
                                            <th className="px-4 py-3">Origin</th>
                                            <th className="px-4 py-3">DG Info</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {lines.map((line, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="p-4">
                                                    <EditableField value={line.description} isEditing={isEditing} onChange={(val) => handleLineChange(i, 'description', val)} />
                                                </td>
                                                <td className="p-4 text-right">
                                                    <EditableField value={line.quantity} isEditing={isEditing} type="number" onChange={(val) => handleLineChange(i, 'quantity', val)} />
                                                </td>
                                                <td className="p-4 text-right">
                                                    <EditableField value={line.netWeightKg} isEditing={isEditing} type="number" onChange={(val) => handleLineChange(i, 'netWeightKg', val)} />
                                                </td>
                                                {/* Hide Value column in Client View */}
                                                {viewMode === 'internal' && (
                                                    <td className="p-4 text-right">
                                                        <EditableField value={line.valueUsd} isEditing={isEditing} type="number" onChange={(val) => handleLineChange(i, 'valueUsd', val)} />
                                                    </td>
                                                )}
                                                <td className="p-4">
                                                    <EditableField value={line.htsCode} isEditing={isEditing} onChange={(val) => handleLineChange(i, 'htsCode', val)} />
                                                </td>
                                                <td className="p-4">
                                                    <EditableField value={line.countryOfOrigin} isEditing={isEditing} onChange={(val) => handleLineChange(i, 'countryOfOrigin', val)} />
                                                </td>
                                                <td className="p-4 w-48">
                                                    <div className="flex flex-col gap-2">
                                                        <label className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={line.isDangerousGoods || false}
                                                                onChange={(e) => handleLineChange(i, 'isDangerousGoods', e.target.checked)}
                                                                disabled={!isEditing}
                                                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
                                                            />
                                                            <span className="text-xs font-semibold text-slate-600">DG?</span>
                                                        </label>
                                                        {(line.isDangerousGoods) && (
                                                            <div className="grid grid-cols-2 gap-1">
                                                                <EditableField
                                                                    placeholder="UN#"
                                                                    value={line.dgUnNumber}
                                                                    isEditing={isEditing}
                                                                    onChange={async (val) => {
                                                                        handleLineChange(i, 'dgUnNumber', val);
                                                                        if (val && val.length >= 4) {
                                                                            try {
                                                                                const dg = await api.lookupUnNumber(val);
                                                                                if (dg) {
                                                                                    handleLineChange(i, 'dgHazardClass', dg.hazardClass);
                                                                                    handleLineChange(i, 'dgPackingGroup', dg.packingGroup || '');
                                                                                }
                                                                            } catch (e) { console.log('DG Lookup failed', e); }
                                                                        }
                                                                    }}
                                                                />
                                                                <EditableField placeholder="Class" value={line.dgHazardClass} isEditing={isEditing} onChange={(val) => handleLineChange(i, 'dgHazardClass', val)} />
                                                                <EditableField placeholder="PG" value={line.dgPackingGroup} isEditing={isEditing} onChange={(val) => handleLineChange(i, 'dgPackingGroup', val)} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>

                    <div className="space-y-6">
                        {/* Hide Panels in Client View */}
                        {doc.isShipment && viewMode === 'internal' && (
                            <>
                                <ProfitabilityCard
                                    cost={selectedRateCost}
                                    revenue={revenue}
                                    onRevenueChange={handleRevenueChange}
                                />
                                <FeatureGuard featureKey="CARRIER_INTEGRATION">
                                    <CarrierRatePanel
                                        shipmentId={doc.id}
                                        shipmentStatus={doc.status}
                                        onRateSelect={(rate) => setSelectedRateCost(rate ? rate.totalCharge : 0)}
                                        onBook={(result) => {
                                            setDoc(prev => ({
                                                ...prev,
                                                status: 'booked',
                                                carrierCode: 'MOCK',
                                                trackingNumber: result.trackingNumber
                                            }));
                                        }}
                                    />
                                </FeatureGuard>
                                <FeatureGuard featureKey="CARRIER_INTEGRATION">
                                    <ForwarderBookingPanel
                                        shipmentId={doc.id}
                                        shipmentStatus={doc.status}
                                        onBook={() => {
                                            setDoc(prev => ({ ...prev, status: 'booked' }));
                                        }}
                                    />
                                </FeatureGuard>
                                <FeatureGuard featureKey="COMPLIANCE_ENHANCED">
                                    <AesPanel
                                        shipment={doc}
                                        onUpdate={(field, val) => handleHeaderChange(field, val)} // AES fields are on header/root
                                    />
                                    <SanctionsPanel shipmentId={doc.id} />
                                </FeatureGuard>
                            </>
                        )}
                        <Comments documentId={doc.id} user={user} viewMode={viewMode} />
                        <History documentId={!doc.isShipment ? doc.id : undefined} shipmentId={doc.isShipment ? doc.id : undefined} />
                    </div>
                </div>
            </div>
        </div>
    );
}
