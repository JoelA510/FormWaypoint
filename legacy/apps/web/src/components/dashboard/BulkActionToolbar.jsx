import { Printer, X, Download, Truck, Trash2, CheckCircle } from 'lucide-react';

export default function BulkActionToolbar({ count, onClear, onPrint, onBook, onDelete }) {
    if (count === 0) return null;

    return (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-200">
            <div className="bg-slate-900 text-white shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 border border-slate-700">
                <div className="flex items-center gap-3 pr-4 border-r border-slate-700">
                    <span className="bg-primary-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {count} Selected
                    </span>
                    <button
                        onClick={onClear}
                        className="text-slate-400 hover:text-white transition-colors"
                        title="Clear Selection"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onPrint}
                        className="flex flex-col items-center gap-1 group px-2"
                    >
                        <div className="p-2 rounded-lg bg-slate-800 group-hover:bg-slate-700 text-slate-300 group-hover:text-white transition-all">
                            <Printer className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium text-slate-400 group-hover:text-white">Print</span>
                    </button>

                    <button
                        onClick={onBook}
                        className="flex flex-col items-center gap-1 group px-2"
                    >
                        <div className="p-2 rounded-lg bg-slate-800 group-hover:bg-slate-700 text-slate-300 group-hover:text-white transition-all">
                            <Truck className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium text-slate-400 group-hover:text-white">Book</span>
                    </button>

                    <button
                        onClick={() => alert('Download manifest')}
                        className="flex flex-col items-center gap-1 group px-2"
                    >
                        <div className="p-2 rounded-lg bg-slate-800 group-hover:bg-slate-700 text-slate-300 group-hover:text-white transition-all">
                            <Download className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium text-slate-400 group-hover:text-white">Export</span>
                    </button>

                    <div className="w-px h-8 bg-slate-700 mx-2"></div>

                    <button
                        onClick={onDelete}
                        className="flex flex-col items-center gap-1 group px-2"
                    >
                        <div className="p-2 rounded-lg bg-red-900/30 group-hover:bg-red-900/50 text-red-400 group-hover:text-red-300 transition-all">
                            <Trash2 className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium text-red-400 group-hover:text-red-300">Delete</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
