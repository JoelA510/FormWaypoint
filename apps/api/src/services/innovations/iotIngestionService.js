const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../../utils/logger');
const csv = require('csv-parse'); // Assuming csv-parse is available or similar

class IotIngestionService {

    /**
     * Ingests a CSV dump from a data logger (e.g., Tive, Sensitech).
     * @param {string} shipmentId 
     * @param {string} csvContent 
     */
    async ingestLogFile(shipmentId, csvContent) {
        logger.info(`Ingesting IoT log for shipment ${shipmentId}`);

        // Parse CSV
        // Mock parsing logic
        const readings = []; // Populate this

        // For MVP, manual parse or split
        const lines = csvContent.split('\n');
        let ingestedCount = 0;

        for (const line of lines.slice(1)) { // Skip header
            if (!line.trim()) continue;
            const cols = line.split(',');
            if (cols.length < 3) continue;

            // Mock Schema: Timestamp, Temp, Humidity
            const timestamp = new Date(cols[0]);
            const temp = parseFloat(cols[1]);
            const hum = parseFloat(cols[2]);

            await prisma.sensorReading.create({
                data: {
                    shipmentId,
                    deviceId: 'LOGGER_UPLOAD',
                    timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp,
                    temperature: isNaN(temp) ? null : temp,
                    humidity: isNaN(hum) ? null : hum
                }
            });
            ingestedCount++;
        }

        // Check compliance (Cold Chain)
        await this.checkCompliance(shipmentId);

        return { success: true, count: ingestedCount };
    }

    async checkCompliance(shipmentId) {
        // If any reading > 25C, flag shipment
        const violations = await prisma.sensorReading.findMany({
            where: {
                shipmentId,
                temperature: { gt: 25.0 }
            }
        });

        if (violations.length > 0) {
            logger.warn(`Shipment ${shipmentId} has cold chain violations!`);
            // Could update shipment status or tag it
        }
    }
}

module.exports = IotIngestionService;
