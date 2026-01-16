/**
 * Shared Page Header Component
 */
export default function PageHeader({ title, description, actions, children }) {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
                {description && <p className="text-slate-500 text-sm mt-1">{description}</p>}
                {children}
            </div>
            {actions && (
                <div className="flex items-center gap-3">
                    {actions}
                </div>
            )}
        </div>
    );
}
