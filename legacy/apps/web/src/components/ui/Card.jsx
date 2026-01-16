/**
 * Shared Card Component
 */
export default function Card({ children, className = '', padding = 'p-6', ...props }) {
    return (
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${padding} ${className}`} {...props}>
            {children}
        </div>
    );
}
