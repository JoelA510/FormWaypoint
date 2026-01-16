const logger = require('../../utils/logger');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class GeocodingService {

    /**
     * Geocode an address string or object.
     * @param {string|object} address 
     */
    async geocode(address) {
        // Mock Implementation
        // In reality, call Google Maps or Mapbox API

        // Simulating async API call
        await new Promise(resolve => setTimeout(resolve, 300));

        // Return random coordinates around a central point (e.g. Chicago)
        // Lat: 41.8781, Lng: -87.6298
        const lat = 41.8781 + (Math.random() - 0.5) * 0.1;
        const lng = -87.6298 + (Math.random() - 0.5) * 0.1;

        return {
            lat,
            lng,
            formattedAddress: "123 Mock St, Chicago, IL 60601"
        };
    }

    /**
     * Batch geocode all parties without coordinates.
     */
    async backfillCoordinates() {
        const parties = await prisma.party.findMany({
            where: { lat: null }
        });

        logger.info(`Geocoding backfill: ${parties.length} parties found.`);

        let count = 0;
        for (const party of parties) {
            const coords = await this.geocode(party);
            await prisma.party.update({
                where: { id: party.id },
                data: { lat: coords.lat, lng: coords.lng }
            });
            count++;
        }
        return count;
    }
}

module.exports = new GeocodingService();
