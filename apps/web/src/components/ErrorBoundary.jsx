import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-8 text-center border border-slate-200">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>

                        <h1 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h1>
                        <p className="text-slate-500 mb-6">
                            We encountered an unexpected error. Please try reloading the page.
                        </p>

                        <div className="flex justify-center gap-4">
                            <button
                                onClick={() => window.location.assign('/')}
                                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium transition-colors"
                            >
                                Go Home
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
                            >
                                Reload Page
                            </button>
                        </div>

                        {process.env.NODE_ENV !== 'production' && (
                            <div className="mt-8 text-left">
                                <details className="bg-slate-50 rounded-lg border border-slate-200">
                                    <summary className="px-4 py-2 cursor-pointer font-mono text-xs text-slate-500 hover:bg-slate-100 rounded-t-lg">
                                        Error Details (Dev Only)
                                    </summary>
                                    <pre className="p-4 text-xs font-mono text-red-600 overflow-auto max-h-48 border-t border-slate-200 whitespace-pre-wrap">
                                        {this.state.error?.toString()}
                                        {'\n\n'}
                                        {this.state.error?.stack}
                                    </pre>
                                </details>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
