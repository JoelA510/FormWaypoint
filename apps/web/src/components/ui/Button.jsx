import { Loader } from 'lucide-react';

/**
 * Shared Button Component
 * @param {string} variant - primary, secondary, ghost, danger
 * @param {string} size - sm, md, lg
 * @param {boolean} loading - show loading spinner
 * @param {React.ReactNode} icon - icon component
 */
export default function Button({
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    icon = null,
    className = '',
    disabled,
    ...props
}) {
    const baseStyles = "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 rounded-lg focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        primary: "bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow-primary-500/30",
        secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-sm",
        ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
        danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-transparent"
    };

    const sizes = {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base"
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <Loader className="w-4 h-4 animate-spin" />}
            {!loading && icon && <span className="flex-shrink-0">{icon}</span>}
            {children}
        </button>
    );
}
