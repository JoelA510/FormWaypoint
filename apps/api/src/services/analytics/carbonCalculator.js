class CarbonCalculator {
    /**
     * Calculate CO2e for a shipment using GLEC framework (simplified)
     * @param {Object} shipment 
     */
    calculate(shipment) {
        // GLEC Formula: Distance * Weight * ModeFactor

        // 1. Determine Distance (mocked or from shipment if available)
        const distanceKm = shipment.distanceKm || 1000; // Default 1000km

        // 2. Determine Weight (Tonnes)
        const weightTonnes = (shipment.totalWeightKg || 1) / 1000;

        // 3. Determine Mode Factor (gCO2e per tonne-km)
        // Road (Truck) ~ 62g
        // Air ~ 602g
        // Sea ~ 8g
        // Rail ~ 22g
        let emissionFactor = 62; // Default Truck
        let mode = 'ROAD';

        if (shipment.serviceCode && shipment.serviceCode.includes('AIR')) {
            emissionFactor = 602;
            mode = 'AIR';
        } else if (shipment.serviceCode && shipment.serviceCode.includes('OCEAN')) {
            emissionFactor = 8;
            mode = 'OCEAN';
        }

        const totalCo2eGrams = distanceKm * weightTonnes * emissionFactor;
        const totalCo2eKg = totalCo2eGrams / 1000;

        return {
            co2eKg: parseFloat(totalCo2eKg.toFixed(2)),
            factorUsed: emissionFactor,
            mode,
            distanceKm
        };
    }
}

module.exports = new CarbonCalculator();
