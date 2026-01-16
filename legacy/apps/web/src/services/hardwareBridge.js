// HardwareBridge.js
// Simulates connection to local hardware features via a bridge application or browser APIs.
// In a real localized app, this might connect to localhost:xxxx or use WebSerial.

class HardwareBridge {
    constructor() {
        this.isConnected = false;
        this.listeners = new Set();
        this.mockScaleWeight = 0;
    }

    connect() {
        console.log('[HardwareBridge] Connecting to local hardware agent...');
        return new Promise((resolve) => {
            setTimeout(() => {
                this.isConnected = true;
                this.notify('connection', { status: 'connected', devices: ['Zebra ZP 450', 'Mettler Toledo Scale'] });
                resolve(true);
            }, 800);
        });
    }

    disconnect() {
        this.isConnected = false;
        this.notify('connection', { status: 'disconnected' });
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notify(type, data) {
        this.listeners.forEach(cb => cb({ type, data }));
    }

    // Printers
    async printLabel(zplData) {
        if (!this.isConnected) throw new Error("Hardware Bridge not connected");
        console.log('[HardwareBridge] Printing label...', zplData.substring(0, 20) + '...');
        return new Promise(resolve => setTimeout(resolve, 500));
    }

    // Scales
    async readWeight() {
        if (!this.isConnected) {
            // Fallback for demo/dev without bridge
            console.warn('[HardwareBridge] Not connected. Returning mock weight.');
            return (Math.random() * 10 + 1).toFixed(2);
        }

        // Simulate reading from actual hardware
        return new Promise(resolve => {
            setTimeout(() => {
                const weight = (Math.random() * 20 + 0.5).toFixed(2);
                resolve(weight);
            }, 300);
        });
    }

    // Scanners (often just HID, but sometimes Serial)
    // This method might be used for serial scanners
    startScanning() {
        console.log('[HardwareBridge] Listening for serial scanner data...');
    }
}

export const hardwareBridge = new HardwareBridge();
