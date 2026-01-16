/**
 * LandedCostEngine
 * Estimates duties and taxes for international shipments.
 */
class LandedCostEngine {
    constructor() {
        // Mock Duty Rates per country (simplified HS Code logic)
        this.countryRates = {
            'GB': 0.20, // 20% VAT
            'CA': 0.05, // 5% GST (simplified)
            'DE': 0.19, // 19% VAT
            'FR': 0.20, // 20% VAT
        };

        // Thresholds (de minimis)
        this.deMinimis = {
            'US': 800, // USD
            'GB': 135, // GBP (approx 170 USD)
            'EU': 150  // EUR (approx 160 USD)
        };
    }

    /**
     * Calculate estimated landed cost.
     * @param {Object} shipment - The shipment object
     * @returns {Promise<Object>} - Breakdown of duties and taxes
     */
    async calculate(shipment) {
        const destinationCountry = shipment.destinationCountry || 'US';
        const customsValue = shipment.totalCustomsValue || 0;
        const currency = 'USD'; // Simplified

        const rate = this.countryRates[destinationCountry] || 0;
        const threshold = this.deMinimis[destinationCountry] || 0;

        let duties = 0;
        let taxes = 0;

        // Simple De Minimis Logic
        if (customsValue > threshold) {
            // Apply simple flat rate for now
            // Real implementation would look up HS Code tariff
            taxes = customsValue * rate;

            // Assume Average Duty of 5% if over threshold
            duties = customsValue * 0.05;
        }

        const total = duties + taxes;

        return {
            estimatedDuties: parseFloat(duties.toFixed(2)),
            estimatedTaxes: parseFloat(taxes.toFixed(2)),
            totalLandedCost: parseFloat(total.toFixed(2)),
            currency,
            breakdown: {
                destinationCountry,
                taxRate: rate,
                customsValue
            }
        };
    }
}

module.exports = new LandedCostEngine();
