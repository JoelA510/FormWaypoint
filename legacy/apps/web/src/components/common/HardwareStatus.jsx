import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Printer, Scale } from 'lucide-react';
import { hardwareBridge } from '../../services/hardwareBridge';

export default function HardwareStatus() {
    const [status, setStatus] = useState({ connected: false, devices: [] });
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        // Subscribe to bridge updates
        const unsubscribe = hardwareBridge.subscribe((msg) => {
            if (msg.type === 'connection') {
                setStatus({
                    connected: msg.data.status === 'connected',
                    devices: msg.data.devices || []
                });
            }
        });

        // Initial check logic could go here if the bridge had a synchronous getter
        return () => unsubscribe();
    }, []);

    const handleConnect = async () => {
        await hardwareBridge.connect();
    };

    return (
        <div className="relative z-50">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${status.connected
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
            >
                {status.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {status.connected ? 'Station Online' : 'Station Offline'}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 p-4 animate-in fade-in zoom-in-95 duration-200">
                    <h4 className="font-semibold text-slate-900 mb-2 flex items-center justify-between">
                        Hardware Bridge
                        <span className={`h-2 w-2 rounded-full ${status.connected ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                    </h4>

                    {!status.connected ? (
                        <div className="text-center py-4">
                            <p className="text-sm text-slate-500 mb-3">
                                Connect to local hardware agent to enable scales and printers.
                            </p>
                            <button
                                onClick={handleConnect}
                                className="btn-primary w-full text-sm py-1.5"
                            >
                                Connect Now
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="text-xs text-emerald-600 bg-emerald-50 p-2 rounded border border-emerald-100 mb-2">
                                ✓ Connected to Local Agent
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Detected Devices</p>
                                {status.devices.length > 0 ? (
                                    status.devices.map((dev, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                                            {dev.toLowerCase().includes('scale') ? <Scale className="w-3.5 h-3.5 text-slate-400" /> : <Printer className="w-3.5 h-3.5 text-slate-400" />}
                                            {dev}
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-sm text-slate-400 italic">No devices found</div>
                                )}
                            </div>

                            <div className="pt-2 border-t border-slate-100 mt-2">
                                <button
                                    onClick={() => hardwareBridge.disconnect()}
                                    className="text-xs text-red-500 hover:text-red-700 w-full text-left flex items-center gap-1"
                                >
                                    Disconnect
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
