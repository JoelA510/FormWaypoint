import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Ship, Users, FileSpreadsheet, Package, BarChart3, Map as MapIcon } from 'lucide-react';
import ReportsPage from './components/reports/ReportsPage';
import KanbanBoard from './components/kanban/KanbanBoard';
import SupplyChainMap from './components/map/SupplyChainMap'; // Phase 3

import DocumentReviewPage from './components/review/DocumentReviewPage';
import ShipmentReviewPage from './components/review/ShipmentReviewPage';
import AddressBookPage from './components/address-book/AddressBookPage';
import ProductLibraryPage from './components/items/ProductLibraryPage';
import TemplateLibraryPage from './components/templates/TemplateLibraryPage';
import ErpExportDashboard from './components/erp/ErpExportDashboard';

import ImportPage from './components/import/ImportPage';
import Dashboard from './components/dashboard/Dashboard';
import NotificationBell from './components/common/NotificationBell';
import Login from './components/auth/Login';
import { api } from './services/api';
import { FeatureFlagProvider } from './context/FeatureFlagContext';
import RoutingRulesPage from './components/rules/RoutingRulesPage';
import SettingsPage from './components/settings/SettingsPage';
import IntegrationsPage from './components/settings/IntegrationsPage';

const ProtectedRoute = ({ children, user, loading }) => {
    const location = useLocation();

    if (loading) {
        return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
};

// Layout Component
const Layout = ({ user, onLogout, children }) => {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-8">
                        <Link to="/" className="flex items-center gap-3">
                            <div className="bg-primary-600 p-2 rounded-lg">
                                <Ship className="w-6 h-6 text-white" />
                            </div>
                            <h1 className="text-xl font-bold text-slate-900 tracking-tight">FormWaypoint</h1>
                        </Link>

                        <nav className="hidden md:flex items-center space-x-1">
                            <Link to="/" className="text-slate-600 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50">Dashboard</Link>
                            <Link to="/import" className="text-slate-600 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50 flex items-center gap-2">
                                <FileSpreadsheet className="w-4 h-4" />
                                Import
                            </Link>
                            <Link to="/kanban" className="text-slate-600 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" />
                                Kanban
                            </Link>
                            <Link to="/map" className="text-slate-600 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50 flex items-center gap-2">
                                <MapIcon className="w-4 h-4" />
                                Map
                            </Link>
                            <div className="h-6 w-px bg-slate-200 mx-2"></div>
                            <Link to="/parties" className="text-slate-600 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50"> Parties </Link>
                            <Link to="/items" className="text-slate-600 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50"> Products </Link>
                            <Link to="/templates" className="text-slate-600 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50"> Templates </Link>
                            <Link to="/reports" className="text-slate-600 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50"> Reports </Link>
                            <Link to="/rules" className="text-slate-600 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50"> Rules </Link>
                            <Link to="/settings" className="text-slate-600 hover:text-primary-600 font-medium px-3 py-2 rounded-md hover:bg-slate-50"> Settings </Link>
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-full border border-slate-100">
                            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-semibold text-sm">
                                {user?.username?.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-slate-700">{user?.username}</span>
                        </div>
                        <NotificationBell />
                        <button
                            onClick={onLogout}
                            className="text-slate-500 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-full"
                            title="Logout"
                            aria-label="Logout"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
        </div >
    );
};

function AppContent() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        checkAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const checkAuth = async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            setLoading(false);
            return;
        }

        api.setToken(token);
        try {
            const res = await fetch('/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const userData = await res.json();
                setUser(userData);
            } else {
                // Token invalid
                handleLogout();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            handleLogout();
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = (userData, token) => {
        api.setToken(token);
        setUser(userData);
        const origin = location.state?.from?.pathname || '/';
        navigate(origin);
    };

    const handleLogout = () => {
        api.setToken(null);
        setUser(null);
        navigate('/login');
    };

    return (
        <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
                <Route path="/login" element={
                    !user ? <Login onLogin={handleLogin} /> : <Navigate to="/" replace />
                } />

                <Route path="/" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <Dashboard />
                        </Layout>
                    </ProtectedRoute>
                } />

                <Route path="/import" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <ImportPage />
                            </motion.div>
                        </Layout>
                    </ProtectedRoute>
                } />

                <Route path="/shipments/new" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <DocumentReviewPage />
                        </Layout>
                    </ProtectedRoute>
                } />

                <Route path="/documents/:id" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <DocumentReviewPage
                                    user={user}
                                    onBack={() => navigate('/')}
                                />
                            </motion.div>
                        </Layout>
                    </ProtectedRoute>
                } />

                <Route path="/shipments/:id" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <ShipmentReviewPage
                                    user={user}
                                    onBack={() => navigate('/import')}
                                />
                            </motion.div>
                        </Layout>
                    </ProtectedRoute>
                } />

                <Route path="/parties" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <AddressBookPage />
                            </motion.div>
                        </Layout>
                    </ProtectedRoute>
                } />

                <Route path="/items" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <ProductLibraryPage />
                            </motion.div>
                        </Layout>
                    </ProtectedRoute>
                } />

                <Route path="/templates" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <TemplateLibraryPage />
                            </motion.div>
                        </Layout>
                    </ProtectedRoute>
                } />

                <Route path="/reports" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <ReportsPage />
                            </motion.div>
                        </Layout>
                    </ProtectedRoute>
                } />
                <Route path="/rules" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <RoutingRulesPage />
                        </Layout>
                    </ProtectedRoute>
                } />
                <Route path="/settings" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <SettingsPage />
                        </Layout>
                    </ProtectedRoute>
                } />
                <Route path="/settings/integrations" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <IntegrationsPage />
                        </Layout>
                    </ProtectedRoute>
                } />
                <Route path="/erp" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <ErpExportDashboard />
                            </motion.div>
                        </Layout>
                    </ProtectedRoute>
                } />
                <Route path="/kanban" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                <KanbanBoard />
                            </motion.div>
                        </Layout>
                    </ProtectedRoute>
                } />
                <Route path="/map" element={
                    <ProtectedRoute user={user} loading={loading}>
                        <Layout user={user} onLogout={handleLogout}>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.5 }}
                            >
                                <SupplyChainMap />
                            </motion.div>
                        </Layout>
                    </ProtectedRoute>
                } />
            </Routes >
        </AnimatePresence >
    );
}

function App() {
    return (
        <BrowserRouter>
            <FeatureFlagProvider>
                <AppContent />
            </FeatureFlagProvider>
        </BrowserRouter>
    );
}

export default App;
