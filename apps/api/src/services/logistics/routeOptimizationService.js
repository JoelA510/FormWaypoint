/**
 * Simple TSP Solver (Nearest Neighbor)
 * For rigorous optimization, integration with OSRM or Google Routes API is required.
 */
class RouteOptimizationService {

    /**
     * Optimize stop order for a list of shipments.
     * @param {object} startLocation - { lat, lng }
     * @param {Array<object>} shipments - Array of shipments with consignee { lat, lng }
     * @returns {Array<object>} - Ordered list of shipments
     */
    optimize(startLocation, shipments) {
        if (!startLocation || !shipments || shipments.length === 0) return shipments;

        const unvisited = [...shipments];
        const visited = [];
        let currentLocation = startLocation;

        while (unvisited.length > 0) {
            let nearestIndex = -1;
            let minDistance = Infinity;

            for (let i = 0; i < unvisited.length; i++) {
                const s = unvisited[i];
                // Ensure we have coords
                if (!s.consignee || !s.consignee.lat || !s.consignee.lng) continue;

                const dist = this.calculateDistance(
                    currentLocation.lat, currentLocation.lng,
                    s.consignee.lat, s.consignee.lng
                );

                if (dist < minDistance) {
                    minDistance = dist;
                    nearestIndex = i;
                }
            }

            if (nearestIndex !== -1) {
                const nextStop = unvisited.splice(nearestIndex, 1)[0];
                visited.push(nextStop);
                currentLocation = { lat: nextStop.consignee.lat, lng: nextStop.consignee.lng };
            } else {
                // Determine what to do with remaining if no coords: append to end
                visited.push(...unvisited);
                break;
            }
        }

        return visited.map((s, index) => ({
            ...s,
            stopOrder: index + 1
        }));
    }

    /**
     * Haversine formula for distance
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the earth in km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in km
        return d;
    }

    deg2rad(deg) {
        return deg * (Math.PI / 180);
    }
}

module.exports = new RouteOptimizationService();
