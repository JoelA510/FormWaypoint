
import { ShieldCheck, ShieldAlert, Shield } from 'lucide-react';

export default function AESStatusBadge({ status, itn }) {
    if (itn) {
        return (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-100">
                <ShieldCheck className="w-4 h-4" />
                <div className="flex flex-col leading-none">
                    <span className="text-[10px] uppercase font-bold tracking-wider">AES Filed</span>
                    <span className="text-xs font-mono font-medium">{itn}</span>
                </div>
            </div>
        );
    }

    if (status === 'pending') {
        return (
            <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full border border-amber-100">
                <Shield className="w-4 h-4" />
                <span className="text-xs font-medium">AES Pending</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 bg-slate-50 text-slate-500 px-3 py-1.5 rounded-full border border-slate-200">
            <ShieldAlert className="w-4 h-4" />
            <span className="text-xs font-medium">AES Not Filed</span>
        </div>
    );
}
