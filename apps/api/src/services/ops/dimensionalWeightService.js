const logger = require('../../utils/logger');

class DimensionalWeightService {
    constructor() {
        // Default divisors
        this.DIVISORS = {
            IMPERIAL: 139, // (L*W*H)/139 for inches/lbs
            METRIC: 5000   // (L*W*H)/5000 for cm/kg
        };
    }

    /**
     * Calculates volumetric weight
     * @param {number} length 
     * @param {number} width 
     * @param {number} height 
     * @param {string} unit 'in' or 'cm'
     * @param {number} customDivisor Optional override
     * @returns {number} The calculated dim weight, rounded up
     */
    calculate(length, width, height, unit = 'in', customDivisor = null) {
        const divisor = customDivisor || (unit === 'in' ? this.DIVISORS.IMPERIAL : this.DIVISORS.METRIC);

        if (length <= 0 || width <= 0 || height <= 0) return 0;

        const volume = length * width * height;
        const rawDimWeight = volume / divisor;

        // Carriers typically round up to the nearest whole number (pound/kg)
        return Math.ceil(rawDimWeight);
    }

    /**
     * Returns the billable weight (max of actual vs dim)
     * @param {number} actualWeight 
     * @param {number} dimWeight 
     */
    getBillableWeight(actualWeight, dimWeight) {
        return Math.max(actualWeight, dimWeight);
    }
}

module.exports = DimensionalWeightService;
