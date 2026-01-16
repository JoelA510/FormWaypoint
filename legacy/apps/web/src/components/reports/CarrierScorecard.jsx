import { BarChart3, TrendingUp, TrendingDown, Minus, ArrowRight, ShieldCheck, Clock, DollarSign } from 'lucide-react';

export default function CarrierScorecard({ data = [], dateRangeLabel = 'Last 30d' }) {
    if (!data || data.length === 0) return null;

    // Helper to determine badge color based on score
    const getScoreColor = (score) => {
        if (score >= 95) return 'text-emerald-600 bg-emerald-50';
        if (score >= 90) return 'text-amber-600 bg-amber-50';
        return 'text-red-600 bg-red-50';
    };

    return (
        <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary-600" />
                Carrier Scorecards
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {data.map(carrier => (
                    <div key={carrier.carrierId} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:border-primary-200 transition-colors group">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">{carrier.carrierName}</h3>
                                <p className="text-xs text-slate-500">{carrier.shipmentCount} Shipments</p>
                            </div>
                            <div className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${getScoreColor(carrier.onTimePerformance)}`}>
                                {carrier.onTimePerformance}% OTP
                            </div>
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                            <div className="flex flex-col">
                                <span className="text-slate-400 text-xs flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Avg Transit
                                </span>
                                <span className="font-medium text-slate-700">{carrier.avgTransitDays} Days</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-slate-400 text-xs flex items-center justify-end gap-1">
                                    <DollarSign className="w-3 h-3" /> Cost/lb
                                </span>
                                <span className="font-medium text-slate-700">${carrier.avgCostPerLb.toFixed(2)}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-slate-400 text-xs flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Damage
                                </span>
                                <span className={`font-medium ${carrier.damageRate > 0.1 ? 'text-red-600' : 'text-slate-700'}`}>
                                    {carrier.damageRate}%
                                </span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-slate-400 text-xs flex items-center justify-end gap-1">Trend</span>
                                <span className="flex items-center justify-end gap-1 font-medium text-slate-700">
                                    {carrier.trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                                    {carrier.trend === 'down' && <TrendingDown className="w-3 h-3 text-red-500" />}
                                    {carrier.trend === 'flat' && <Minus className="w-3 h-3 text-slate-400" />}
                                    {dateRangeLabel}
                                </span>
                            </div>
                        </div>

                        {/* Mini Bar Chart Visualization (CSS) */}
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <div className="flex items-end gap-1 h-8">
                                <div className="w-full bg-slate-100 rounded-t-sm h-[30%] group-hover:bg-primary-100 transition-all"></div>
                                <div className="w-full bg-slate-100 rounded-t-sm h-[60%] group-hover:bg-primary-200 transition-all"></div>
                                <div className="w-full bg-slate-100 rounded-t-sm h-[40%] group-hover:bg-primary-100 transition-all"></div>
                                <div className="w-full bg-slate-100 rounded-t-sm h-[80%] group-hover:bg-primary-300 transition-all"></div>
                                <div className="w-full bg-primary-500 rounded-t-sm h-[100%] shadow-lg shadow-primary-200"></div>
                            </div>
                            <div className="text-[10px] text-center text-slate-400 mt-1">Volume Last 5 Weeks</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
