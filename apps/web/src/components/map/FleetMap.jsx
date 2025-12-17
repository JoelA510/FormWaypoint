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
    const res = await fetch('http://localhost:3000/shipments?limit=100', {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
};

const FleetMap = () => {
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
            setShipments(valid);
        } catch (err) {
            console.error('Failed to load map data', err);
        }
    };

    return (
        <MapContainer center={[39.8283, -98.5795]} zoom={4} style={{ height: 'calc(100vh - 64px)', width: '100%' }}>
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />

            {shipments.map(s => (
                <React.Fragment key={s.id}>
                    {/* Shipper Marker */}
                    {s.shipper?.lat && (
                        <Marker position={[s.shipper.lat, s.shipper.lng]}>
                            <Popup>
                                <strong>Shipper: {s.shipper.name}</strong><br />
                                {s.shipper.city}, {s.shipper.stateOrProvince}<br />
                                Shipment: {s.id.substring(0, 8)}
                            </Popup>
                        </Marker>
                    )}

                    {/* Consignee Marker */}
                    {s.consignee?.lat && (
                        <Marker position={[s.consignee.lat, s.consignee.lng]}>
                            <Popup>
                                <strong>Consignee: {s.consignee.name}</strong><br />
                                {s.consignee.city}, {s.consignee.stateOrProvince}
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
                            color={s.status === 'in_transit' ? 'green' : 'blue'}
                            dashArray={s.status === 'in_transit' ? null : '5, 10'}
                        />
                    )}
                </React.Fragment>
            ))}
        </MapContainer>
    );
};

export default FleetMap;
