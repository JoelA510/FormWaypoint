import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon issues in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const fetchShipments = async () => {
    const token = localStorage.getItem('token');
    // Using existing endpoint
    const res = await fetch('http://localhost:3000/shipments?limit=100', {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
};

const SupplyChainMap = () => {
    const [shipments, setShipments] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const data = await fetchShipments();
            // Filter shipments that have at least one valid coordinate set
            const valid = (data.data || []).filter(s =>
                (s.shipper?.lat && s.shipper?.lng) || (s.consignee?.lat && s.consignee?.lng)
            );

            // Sort by priority for z-index rendering order (Last rendered is on top usually, but we use zIndexOffset too)
            // Priority: Exception > In Transit > Booked > Draft
            const priority = { exception: 3, in_transit: 2, booked: 1, draft: 0 };
            valid.sort((a, b) => (priority[a.status] || 0) - (priority[b.status] || 0));

            setShipments(valid);
        } catch (err) {
            console.error('Failed to load map data', err);
        }
    };

    const getZIndex = (status) => {
        switch (status) {
            case 'exception': return 1000;
            case 'in_transit': return 500;
            case 'booked': return 100;
            default: return 0;
        }
    };

    const getRouteColor = (status) => {
        switch (status) {
            case 'exception': return '#ef4444'; // red-500
            case 'in_transit': return '#8b5cf6'; // violet-500
            case 'booked': return '#3b82f6'; // blue-500
            default: return '#94a3b8'; // slate-400
        }
    };

    return (
        <div className="relative h-full w-full">
            <div className="absolute top-4 right-4 z-[400] bg-white p-3 rounded-lg shadow-lg border border-slate-200">
                <h3 className="text-sm font-semibold mb-2">Legend</h3>
                <div className="space-y-1.5 text-xs text-slate-700">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-500"></span> Exception
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-violet-500"></span> In Transit
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span> Booked
                    </div>
                </div>
            </div>

            <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: 'calc(100vh - 64px)', width: '100%' }}>
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                {shipments.map(s => {
                    const zIndex = getZIndex(s.status);
                    const color = getRouteColor(s.status);

                    return (
                        <React.Fragment key={s.id}>
                            {/* Shipper Marker */}
                            {s.shipper?.lat && (
                                <Marker
                                    position={[s.shipper.lat, s.shipper.lng]}
                                    zIndexOffset={zIndex}
                                >
                                    <Popup>
                                        <div className="text-sm">
                                            <div className={`font-bold mb-1 uppercase text-[10px] px-1.5 py-0.5 rounded w-fit text-white
                                                ${s.status === 'exception' ? 'bg-red-500' : 'bg-slate-500'}
                                            `}>
                                                {s.status}
                                            </div>
                                            <strong>Shipper: {s.shipper.name}</strong><br />
                                            {s.shipper.city}, {s.shipper.stateOrProvince}<br />
                                            <a href={`/shipments/${s.id}`} className="text-primary-600 hover:underline">
                                                #{s.id.substring(0, 8)}
                                            </a>
                                        </div>
                                    </Popup>
                                </Marker>
                            )}

                            {/* Consignee Marker */}
                            {s.consignee?.lat && (
                                <Marker
                                    position={[s.consignee.lat, s.consignee.lng]}
                                    zIndexOffset={zIndex}
                                >
                                    <Popup>
                                        <div className="text-sm">
                                            <strong>Consignee: {s.consignee.name}</strong><br />
                                            {s.consignee.city}, {s.consignee.stateOrProvince}
                                        </div>
                                    </Popup>
                                </Marker>
                            )}

                            {/* Route Line */}
                            {s.shipper?.lat && s.consignee?.lat && (
                                <Polyline
                                    positions={[
                                        [s.shipper.lat, s.shipper.lng],
                                        [s.consignee.lat, s.consignee.lng]
                                    ]}
                                    pathOptions={{
                                        color: color,
                                        dashArray: s.status === 'in_transit' ? null : '5, 10',
                                        weight: s.status === 'exception' ? 4 : 3,
                                        opacity: s.status === 'draft' ? 0.4 : 0.8
                                    }}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </MapContainer>
        </div>
    );
};

export default SupplyChainMap;
