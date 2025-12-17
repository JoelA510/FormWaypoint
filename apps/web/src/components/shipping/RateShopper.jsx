
import { Check } from 'lucide-react';

export default function RateShopper({ rates, onSelectRate, selectedRate }) {
    if (!rates || rates.length === 0) return null;

    return (
        <div className="mt-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Available Rates</h3>
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
                        {rates.map((rate, index) => {
                            const isSelected = selectedRate?.serviceCode === rate.serviceCode && selectedRate?.provider === rate.provider;
                            return (
                                <tr key={index} className={isSelected ? 'bg-purple-50' : 'hover:bg-slate-50'}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rate.provider === 'fedex' ? 'bg-purple-100 text-purple-800' : 'bg-yellow-100 text-yellow-800'
                                            }`}>
                                            {rate.provider === 'fedex' ? 'FedEx' : 'UPS'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                                        {rate.serviceName}
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
                                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${isSelected
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
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
