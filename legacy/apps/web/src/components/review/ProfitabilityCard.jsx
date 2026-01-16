import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

export default function ProfitabilityCard({ cost = 0, revenue = 0, currency = 'USD', onRevenueChange }) {
    const [margin, setMargin] = useState(0);
    const [marginPercent, setMarginPercent] = useState(0);
    const [isEditing, setIsEditing] = useState(false);
    const [localRevenue, setLocalRevenue] = useState(revenue);

    useEffect(() => {
        const r = parseFloat(localRevenue) || 0;
        const c = parseFloat(cost) || 0;
        const m = Number((r - c).toFixed(2));
        const mp = r > 0 ? (m / r) * 100 : 0;

        setMargin(m);
        setMarginPercent(mp);
    }, [cost, localRevenue]);

    const handleRevenueBlur = () => {
        setIsEditing(false);
        if (onRevenueChange) {
            onRevenueChange(parseFloat(localRevenue));
        }
    };

    // Determine health status
    let statusColor = 'text-slate-500';
    let bgColor = 'bg-slate-50';
    let Icon = DollarSign;

    if (revenue > 0) {
        if (marginPercent < 0) {
            statusColor = 'text-red-600';
            bgColor = 'bg-red-50';
            Icon = TrendingDown;
        } else if (marginPercent < 15) {
            statusColor = 'text-amber-600';
            bgColor = 'bg-amber-50';
            Icon = AlertCircle;
        } else {
            statusColor = 'text-emerald-600';
            bgColor = 'bg-emerald-50';
            Icon = TrendingUp;
        }
    }

    return (
        <div className="card bg-white border border-slate-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Financials
            </h3>

            <div className="space-y-4">
                {/* Revenue Input */}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Inv. Revenue ({currency})</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={localRevenue}
                            onChange={(e) => setLocalRevenue(e.target.value)}
                            onBlur={handleRevenueBlur}
                            className="input-field py-1 text-sm font-semibold text-slate-900"
                            placeholder="0.00"
                        />
                    </div>
                </div>

                {/* Est. Cost Display */}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Est. Cost ({currency})</label>
                    <div className="text-sm font-medium text-slate-700">
                        {parseFloat(cost).toFixed(2)}
                    </div>
                </div>

                {/* Margin Display */}
                <div className={`rounded-lg p-3 ${bgColor} border border-transparent transition-colors`}>
                    <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${statusColor}`}>Margin</span>
                        <Icon className={`w-4 h-4 ${statusColor}`} />
                    </div>
                    <div className={`text-xl font-bold ${statusColor}`}>
                        {marginPercent.toFixed(1)}%
                    </div>
                    <div className={`text-xs ${statusColor} opacity-80`}>
                        {margin > 0 ? '+' : ''}{margin.toFixed(2)} {currency}
                    </div>
                </div>
            </div>
        </div>
    );
}
