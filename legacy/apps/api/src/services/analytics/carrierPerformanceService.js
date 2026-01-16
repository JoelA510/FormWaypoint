/**
 * Service to calculate carrier performance metrics (Scorecards).
 * Aggregates historical shipment data to determine On-Time Performance, Cost/lb, etc.
 */
class CarrierPerformanceService {

    /**
     * Get performance scorecard for all carriers within a date range.
     * @param {string} fromDate - ISO Start Date
     * @param {string} toDate - ISO End Date
     */
    async getScorecard(fromDate, toDate) {
        // In a real implementation, this would query the DB (e.g. Prisma aggregate)
        // Returning mocked data for demonstration

        return [
            {
                carrierId: 'fedex',
                carrierName: 'FedEx',
                shipmentCount: 1420,
                onTimePerformance: 94.5, // %
                avgCostPerLb: 1.15, // $
                avgTransitDays: 2.8,
                damageRate: 0.2, // %
                trend: 'up' // or 'down', 'flat' (vs previous period)
            },
            {
                carrierId: 'ups',
                carrierName: 'UPS',
                shipmentCount: 980,
                onTimePerformance: 96.2,
                avgCostPerLb: 1.25,
                avgTransitDays: 2.6,
                damageRate: 0.1,
                trend: 'flat'
            },
            {
                carrierId: 'usps',
                carrierName: 'USPS',
                shipmentCount: 450,
                onTimePerformance: 88.0,
                avgCostPerLb: 0.85,
                avgTransitDays: 4.1,
                damageRate: 0.5,
                trend: 'down'
            },
            {
                carrierId: 'dhl',
                carrierName: 'DHL Express',
                shipmentCount: 120,
                onTimePerformance: 98.5,
                avgCostPerLb: 3.50,
                avgTransitDays: 1.5,
                damageRate: 0.0,
                trend: 'up'
            }
        ];
    }

    /**
     * Get detailed trends for a specific carrier.
     */
    async getCarrierTrend(carrierId) {
        // Mock daily OTP data for charts
        const days = 14;
        const trendData = [];
        const now = new Date();

        for (let i = days; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            trendData.push({
                date: date.toISOString().split('T')[0],
                value: 90 + Math.random() * 10 // Random data between 90-100
            });
        }
        return trendData;
    }
}

module.exports = new CarrierPerformanceService();
