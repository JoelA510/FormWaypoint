import { useState } from 'react';
import { Calendar, Clock, Truck, Loader } from 'lucide-react';

export default function PickupScheduler({ onClose }) {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [formData, setFormData] = useState({
        provider: 'fedex',
        date: '',
        windowStart: '09:00',
        windowEnd: '17:00',
        location: 'Front Desk',
        packages: '1',
        weight: '1'
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/carriers/pickups', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    provider: formData.provider,
                    pickupRequest: formData
                })
            });

            if (res.ok) {
                setSuccess(true);
            } else {
                alert('Failed to schedule pickup');
            }
        } catch (error) {
            console.error('Failed to schedule pickup:', error);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Truck className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Pickup Scheduled!</h3>
                <p className="text-slate-500 mb-6">The carrier has been notified.</p>
                <button onClick={onClose} className="btn-primary">Close</button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Carrier</label>
                <select
                    value={formData.provider}
                    onChange={e => setFormData({ ...formData, provider: e.target.value })}
                    className="input-field"
                >
                    <option value="fedex">FedEx</option>
                    <option value="ups">UPS</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="date"
                        value={formData.date}
                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                        className="input-field pl-10"
                        required
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ready Time</label>
                    <div className="relative">
                        <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="time"
                            value={formData.windowStart}
                            onChange={e => setFormData({ ...formData, windowStart: e.target.value })}
                            className="input-field pl-10"
                            required
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Close Time</label>
                    <div className="relative">
                        <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="time"
                            value={formData.windowEnd}
                            onChange={e => setFormData({ ...formData, windowEnd: e.target.value })}
                            className="input-field pl-10"
                            required
                        />
                    </div>
                </div>
            </div>

            {/* Quick Chips */}
            <div className="flex gap-2 justify-start overflow-x-auto pb-1">
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, windowStart: '09:00', windowEnd: '17:00' })}
                    className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full hover:bg-primary-50 hover:text-primary-600 transition-colors whitespace-nowrap"
                >
                    Standard (9-5)
                </button>
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, windowStart: '08:00', windowEnd: '16:00' })}
                    className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full hover:bg-primary-50 hover:text-primary-600 transition-colors whitespace-nowrap"
                >
                    Early (8-4)
                </button>
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, windowStart: '13:00', windowEnd: '17:00' })}
                    className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full hover:bg-primary-50 hover:text-primary-600 transition-colors whitespace-nowrap"
                >
                    PM Pick (1-5)
                </button>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pickup Location</label>
                <input
                    type="text"
                    value={formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                    className="input-field"
                    placeholder="e.g. Front Desk, Loading Dock"
                    required
                />
            </div>

            <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary flex items-center gap-2"
                >
                    {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                    Schedule Pickup
                </button>
            </div>
        </form>
    );
}
