import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function NotificationBell() {
    const [notifications, setNotifications] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);

    const loadNotifications = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/notifications', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setNotifications(data.data || []);
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadNotifications();
        // Poll for new notifications every 30 seconds
        const interval = setInterval(loadNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    const markAsRead = async (id) => {
        try {
            const token = localStorage.getItem('token');
            await fetch(`/notifications/${id}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            loadNotifications();
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div className="relative">
            <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="relative p-2 hover:bg-slate-100 rounded-full transition-colors"
                title="Notifications"
                aria-label="Notifications"
            >
                <Bell className="w-5 h-5 text-slate-600" />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {showDropdown && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden"
                    >
                        <div className="p-4 border-b border-slate-200">
                            <h3 className="font-semibold text-slate-900">Notifications</h3>
                        </div>

                        <div className="max-h-96 overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-slate-500">
                                    <Bell className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                                    <p>No notifications</p>
                                </div>
                            ) : (
                                notifications.map((notification) => (
                                    <button
                                        key={notification.id}
                                        onClick={() => markAsRead(notification.id)}
                                        className={`w-full text-left p-4 border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer transition-colors duration-200 ${!notification.read ? 'bg-purple-50/40' : ''
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {!notification.read && (
                                                <div className="w-2 h-2 bg-purple-600 rounded-full mt-2" />
                                            )}
                                            <div className="flex-1">
                                                <p className="text-sm text-slate-900">{notification.message}</p>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {new Date(notification.createdAt).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Overlay to close dropdown */}
            {showDropdown && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowDropdown(false)}
                />
            )}
        </div>
    );
}
