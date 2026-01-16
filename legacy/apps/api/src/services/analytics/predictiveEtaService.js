const { prisma } = require('../../queue');

class PredictiveEtaService {
    /**
     * Calculate predicted arrival date based on lane history.
     * @param {string} originZip 
     * @param {string} destinationZip 
     * @param {Date} shipDate 
     */
    async predict(originZip, destinationZip, shipDate) {
        // 1. Fetch historical average for this lane (Mocked)
        const laneAvgDays = 3.5; // e.g. from DB aggregation
        const confidence = 0.85; // 85% reliable

        const predictedDate = new Date(shipDate);
        predictedDate.setDate(predictedDate.getDate() + laneAvgDays);

        return {
            predictedDate,
            avgTransitDays: laneAvgDays,
            confidence
        };
    }

    /**
     * Check if a shipment is at risk of being late.
     */
    isAtRisk(shipment) {
        if (!shipment.estimatedDeliveryDate) return false;

        const now = new Date();
        const est = new Date(shipment.estimatedDeliveryDate);

        // If current date > est and status is not delivered
        if (now > est && shipment.status !== 'delivered') {
            return true;
        }

        return false;
    }
}

module.exports = new PredictiveEtaService();
