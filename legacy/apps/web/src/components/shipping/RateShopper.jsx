
import { Check, DollarSign, Clock } from 'lucide-react';

export default function RateShopper({ rates, onSelectRate, selectedRate }) {
    if (!rates || rates.length === 0) return null;

    // Find best metrics
    const minAmount = Math.min(...rates.map(r => r.amount));
    const minTime = Math.min(...rates.map(r => new Date(r.deliveryDate).getTime()));

    // Sort by price ascending
    const sortedRates = [...rates].sort((a, b) => a.amount - b.amount);

    return (
        <div className="mt-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                Available Rates
                <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {rates.length} options
                </span>
            </h3>
            <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Carrier</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Service</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Delivery</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Cost</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {sortedRates.map((rate, index) => {
                            const isSelected = selectedRate?.serviceCode === rate.serviceCode && selectedRate?.provider === rate.provider;
                            const isCheapest = rate.amount === minAmount;
                            const isFastest = new Date(rate.deliveryDate).getTime() === minTime;

                            return (
                                <tr key={index} className={`transition-colors ${isSelected ? 'bg-purple-50' : 'hover:bg-slate-50'}`}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-1">
                                            <span className={`inline-flex items-center w-fit px-2.5 py-0.5 rounded-full text-xs font-medium ${rate.provider === 'fedex' ? 'bg-purple-100 text-purple-800' : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {rate.provider === 'fedex' ? 'FedEx' : 'UPS'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                                        <div className="font-medium">{rate.serviceName}</div>
                                        <div className="flex gap-2 mt-1">
                                            {isCheapest && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                                    <DollarSign className="w-3 h-3" /> Best Price
                                                </span>
                                            )}
                                            {isFastest && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                    <Clock className="w-3 h-3" /> Fastest
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        {new Date(rate.deliveryDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-slate-900">
                                        ${rate.amount.toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => onSelectRate(rate)}
                                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-all ${isSelected
                                                ? 'bg-purple-600 text-white shadow-sm'
                                                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                                                }`}
                                        >
                                            {isSelected && <Check className="w-3 h-3 mr-1" />}
                                            {isSelected ? 'Selected' : 'Select'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
