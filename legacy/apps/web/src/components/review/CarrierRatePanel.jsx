import { useState } from 'react';
import { Truck, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';

export default function CarrierRatePanel({ shipmentId, shipmentStatus, onBook, onRateSelect }) {
    const [rates, setRates] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedRate, setSelectedRate] = useState(null);
    const [isBooking, setIsBooking] = useState(false);

    const handleGetRates = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getRates(shipmentId);
            setRates(data);
            if (onRateSelect) onRateSelect(null); // Reset parent selection on new fetch
            if (data.length === 0) {
                setError('No rates returned. Please check address and weights.');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to fetch rates. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBook = async () => {
        if (!selectedRate) return;
        setIsBooking(true);
        try {
            const result = await api.bookShipment(shipmentId, {
                carrierAccountId: selectedRate.carrierAccountId,
                serviceCode: selectedRate.serviceCode,
                rateId: selectedRate.rateId // if relevant
            });

            if (onBook) {
                onBook(result);
            }
            // Clear rates to show "booked" state if parent doesn't unmount us
            setRates([]);
        } catch (err) {
            console.error(err);
            setError('Booking failed. Please try again.');
        } finally {
            setIsBooking(false);
        }
    };

    if (shipmentStatus === 'booked' || shipmentStatus === 'completed') {
        return null; // Don't show rate shopper if already booked (handled by parent usually)
    }

    return (
        <div className="card">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Truck className="w-5 h-5 text-slate-500" />
                    <h3 className="font-semibold text-slate-900">Carrier Rates</h3>
                </div>
                {rates.length > 0 && (
                    <button
                        onClick={() => setRates([])}
                        className="text-sm text-slate-500 hover:text-slate-700"
                    >
                        Reset
                    </button>
                )}
            </div>

            <div className="p-4">
                {error && (
                    <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-md text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
                    </div>
                )}

                {rates.length === 0 ? (
                    <div className="text-center py-6">
                        <p className="text-slate-500 mb-4 text-sm">
                            Ready to ship? compare rates from your carriers.
                        </p>
                        <button
                            onClick={handleGetRates}
                            disabled={isLoading}
                            className="btn btn-primary w-full justify-center"
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                                    Fetching Rates...
                                </span>
                            ) : (
                                'Shop Rates'
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            {rates.map((rate, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => setSelectedRate(rate)}
                                    className={`
                                        relative p-3 rounded-lg border-2 cursor-pointer transition-all
                                        ${selectedRate === rate
                                            ? 'border-primary-600 bg-primary-50'
                                            : 'border-slate-100 hover:border-slate-200'}
                                    `}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded border border-slate-100">
                                                <Truck className="w-5 h-5 text-slate-400" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-900">{rate.carrierCode}</p>
                                                <p className="text-sm text-slate-600">{rate.serviceName}</p>
                                                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                                    <Clock className="w-3 h-3" />
                                                    {rate.estimatedDays} Day(s) Transit
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-lg text-slate-900">
                                                {rate.currency} {rate.totalCharge}
                                            </p>
                                        </div>
                                    </div>
                                    {selectedRate === rate && (
                                        <div className="absolute top-3 right-3 text-primary-600">
                                            <CheckCircle className="w-5 h-5 fill-primary-100" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <button
                                onClick={handleBook}
                                disabled={!selectedRate || isBooking}
                                className="btn btn-primary w-full justify-center"
                            >
                                {isBooking ? 'Booking...' : 'Book Shipment'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
