

export default function EditableField({ label, value, isEditing, onChange, type = 'text', className = '' }) {
    if (!isEditing) {
        return (
            <div className={className}>
                <span className="block text-xs font-medium text-slate-500 mb-0.5">{label}</span>
                <div className="text-slate-900 text-sm font-medium min-h-[1.25rem]">
                    {value || <span className="text-slate-300 italic">--</span>}
                </div>
            </div>
        );
    }

    return (
        <div className={className}>
            <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
            <input
                type={type}
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-emerald-200 outline-none transition-shadow"
            />
        </div>
    );
}
