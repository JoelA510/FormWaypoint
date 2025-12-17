import { useState } from 'react';
import { Package, Search, ArrowRight, Loader } from 'lucide-react';
import RateShopper from './RateShopper';

export default function ShipmentManager({ documentId, initialData }) {
    const [step, setStep] = useState('details'); // details, rates, label
    const [loading, setLoading] = useState(false);
    const [rates, setRates] = useState([]);
    const [selectedRate, setSelectedRate] = useState(null);
    const [shipmentResult, setShipmentResult] = useState(null);

    const [shipment, setShipment] = useState({
        from: {
            name: initialData?.shipper?.name || '',
            address: initialData?.shipper?.address || '',
            city: initialData?.shipper?.city || '',
            state: initialData?.shipper?.state || '',
            zip: initialData?.shipper?.zip || '',
            country: initialData?.shipper?.country || 'US'
        },
        to: {
            name: initialData?.consignee?.name || '',
            address: initialData?.consignee?.address || '',
            city: initialData?.consignee?.city || '',
            state: initialData?.consignee?.state || '',
            zip: initialData?.consignee?.zip || '',
            country: initialData?.consignee?.country || 'US'
        },
        package: {
            weight: '',
            length: '',
            width: '',
            height: ''
        }
    });

    const handleShopRates = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/carriers/rates', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    shipment: {
                        ...shipment,
                        package: {
                            ...shipment.package,
                            weightUnit: 'lb' // Explicitly invoke normalization
                        }
                    }
                })
            });
            const data = await res.json();
            setRates(data.data || []);
            setStep('rates');
        } catch (error) {
            console.error('Failed to shop rates:', error);
            alert('Failed to fetch rates');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateLabel = async () => {
        if (!selectedRate) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/carriers/shipments', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    provider: selectedRate.provider,
                    shipment: {
                        ...shipment,
                        serviceCode: selectedRate.serviceCode
                    },
                    documentId
                })
            });
            const data = await res.json();
            setShipmentResult(data);
            setStep('label');
        } catch (error) {
            console.error('Failed to create label:', error);
            alert('Failed to create label');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Package className="w-6 h-6 text-purple-600" />
                Create Shipment
            </h2>

            {/* Progress Steps */}
            <div className="flex items-center mb-8 text-sm">
                <div className={`flex items-center gap-2 ${step === 'details' ? 'text-purple-600 font-bold' : 'text-slate-500'}`}>
                    <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center">1</div>
                    Details
                </div>
                <div className="w-8 h-px bg-slate-300 mx-2" />
                <div className={`flex items-center gap-2 ${step === 'rates' ? 'text-purple-600 font-bold' : 'text-slate-500'}`}>
                    <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center">2</div>
                    Rates
                </div>
                <div className="w-8 h-px bg-slate-300 mx-2" />
                <div className={`flex items-center gap-2 ${step === 'label' ? 'text-purple-600 font-bold' : 'text-slate-500'}`}>
                    <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center">3</div>
                    Label
                </div>
            </div>

            {step === 'details' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        {/* From Address */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-slate-700">Ship From</h3>
                            <input
                                placeholder="Name"
                                value={shipment.from.name}
                                onChange={e => setShipment({ ...shipment, from: { ...shipment.from, name: e.target.value } })}
                                className="input-field"
                            />
                            <input
                                placeholder="Zip Code"
                                value={shipment.from.zip}
                                onChange={e => setShipment({ ...shipment, from: { ...shipment.from, zip: e.target.value } })}
                                className="input-field"
                            />
                        </div>

                        {/* To Address */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-slate-700">Ship To</h3>
                            <input
                                placeholder="Name"
                                value={shipment.to.name}
                                onChange={e => setShipment({ ...shipment, to: { ...shipment.to, name: e.target.value } })}
                                className="input-field"
                            />
                            <input
                                placeholder="Zip Code"
                                value={shipment.to.zip}
                                onChange={e => setShipment({ ...shipment, to: { ...shipment.to, zip: e.target.value } })}
                                className="input-field"
                            />
                        </div>
                    </div>

                    {/* Package Details */}
                    <div>
                        <h3 className="font-semibold text-slate-700 mb-3">Package Details</h3>
                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <label className="text-xs text-slate-500">Weight (lbs)</label>
                                <input
                                    type="number"
                                    value={shipment.package.weight}
                                    onChange={e => setShipment({ ...shipment, package: { ...shipment.package, weight: e.target.value } })}
                                    className="input-field"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500">Length (in)</label>
                                <input
                                    type="number"
                                    value={shipment.package.length}
                                    onChange={e => setShipment({ ...shipment, package: { ...shipment.package, length: e.target.value } })}
                                    className="input-field"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500">Width (in)</label>
                                <input
                                    type="number"
                                    value={shipment.package.width}
                                    onChange={e => setShipment({ ...shipment, package: { ...shipment.package, width: e.target.value } })}
                                    className="input-field"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500">Height (in)</label>
                                <input
                                    type="number"
                                    value={shipment.package.height}
                                    onChange={e => setShipment({ ...shipment, package: { ...shipment.package, height: e.target.value } })}
                                    className="input-field"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={handleShopRates}
                            disabled={loading}
                            className="btn-primary flex items-center gap-2"
                        >
                            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            Shop Rates
                        </button>
                    </div>
                </div>
            )}

            {step === 'rates' && (
                <div>
                    <RateShopper
                        rates={rates}
                        selectedRate={selectedRate}
                        onSelectRate={setSelectedRate}
                    />
                    <div className="flex justify-between mt-6">
                        <button onClick={() => setStep('details')} className="btn-secondary">
                            Back
                        </button>
                        <button
                            onClick={handleCreateLabel}
                            disabled={!selectedRate || loading}
                            className="btn-primary flex items-center gap-2"
                        >
                            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                            Generate Label
                        </button>
                    </div>
                </div>
            )}

            {step === 'label' && shipmentResult && (
                <div className="text-center py-8">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Package className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Shipment Created!</h3>
                    <p className="text-slate-500 mb-6">Tracking Number: {shipmentResult.trackingNumber}</p>

                    <div className="flex justify-center gap-4">
                        <a
                            href={shipmentResult.labelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-primary"
                        >
                            Print Label
                        </a>
                        <button onClick={() => window.location.reload()} className="btn-secondary">
                            New Shipment
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
