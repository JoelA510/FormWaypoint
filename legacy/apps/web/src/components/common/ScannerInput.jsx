import { useState, useEffect, useRef } from 'react';
import { Scan, Keyboard } from 'lucide-react';

/**
 * ScannerInput
 * Detects rapid keyboard input typical of HID barcode scanners.
 * Or renders a manual input field that grabs focus.
 */
export default function ScannerInput({ onScan, label = "Scan Barcode", autoFocus = false }) {
    const [buffer, setBuffer] = useState('');
    const [lastKeystrokeTime, setLastKeystrokeTime] = useState(0);
    const [isScanning, setIsScanning] = useState(false);
    const inputRef = useRef(null);

    // Timeout to clear buffer if typing is too slow (manual entry vs scan)
    const SCAN_TIMEOUT_MS = 100;

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus]);

    const handleChange = (e) => {
        const val = e.target.value;
        setBuffer(val);

        const now = Date.now();

        // If rapid input (or just simple logic: typical scanners end with Enter)
        // We'll rely on KeyDown 'Enter' for final submission, 
        // but we can detect "Scanner-like" speed here if needed.
        if (now - lastKeystrokeTime < SCAN_TIMEOUT_MS && val.length > 2) {
            setIsScanning(true);
        } else {
            setIsScanning(false);
        }

        setLastKeystrokeTime(now);
    };

    const handleKeyDown = (e) => {
        // Scanners typically send 'Enter' at the end
        if (e.key === 'Enter') {
            e.preventDefault();
            if (buffer.trim()) {
                onScan(buffer.trim());
                setBuffer(''); // Clear after scan
                setIsScanning(false);
            }
        }
    };

    return (
        <div className="relative">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {label}
            </label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {isScanning ? (
                        <Scan className="h-5 w-5 text-emerald-500 animate-pulse" />
                    ) : (
                        <Keyboard className="h-5 w-5 text-slate-400" />
                    )}
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    className={`input-field pl-10 font-mono text-sm ${isScanning ? 'border-emerald-500 ring-1 ring-emerald-200' : ''}`}
                    placeholder="Click to scan or type..."
                    value={buffer}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                />
                {isScanning && (
                    <div className="absolute right-3 top-2.5">
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                    </div>
                )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
                Focus field and scan, or type code and press Enter.
            </p>
        </div>
    );
}
