/**
 * Shared Badge Component
 * @param {string} variant - success, warning, error, info, neutral
 */
export default function Badge({ children, variant = 'neutral', className = '' }) {
    const variants = {
        success: "bg-emerald-50 text-emerald-700 border-emerald-100",
        warning: "bg-amber-50 text-amber-700 border-amber-100",
        error: "bg-red-50 text-red-700 border-red-100",
        info: "bg-blue-50 text-blue-700 border-blue-100",
        neutral: "bg-slate-100 text-slate-600 border-slate-200",
        primary: "bg-primary-50 text-primary-700 border-primary-100"
    };

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${variants[variant]} ${className}`}>
            {children}
        </span>
    );
}
