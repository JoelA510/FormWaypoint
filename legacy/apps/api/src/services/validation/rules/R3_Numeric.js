module.exports = {
    name: 'R3_Numeric',
    validate: (shipment, lineItems) => {
        const issues = [];

        // Sum extended values
        const totalLinesValue = lineItems.reduce((acc, line) => acc + (line.extendedValue || 0), 0);
        const headerValue = shipment.totalCustomsValue || 0;

        // Check Value Consistency (Tolerance $1.00)
        if (Math.abs(totalLinesValue - headerValue) > 1.00) {
            issues.push({
                code: 'VALUE_MISMATCH',
                severity: 'warning',
                message: `Sum of line values (${totalLinesValue.toFixed(2)}) does not match header total (${headerValue.toFixed(2)})`,
                path: 'header.totalCustomsValue'
            });
        }

        // Sum weights
        const totalLinesWeight = lineItems.reduce((acc, line) => acc + (line.netWeightKg || 0), 0);
        const headerWeight = shipment.totalWeightKg || 0;

        // Check Weight Consistency (Tolerance 0.1kg)
        if (Math.abs(totalLinesWeight - headerWeight) > 0.1) {
            issues.push({
                code: 'WEIGHT_MISMATCH',
                severity: 'warning',
                message: `Sum of line net weights (${totalLinesWeight.toFixed(2)}) does not match header total (${headerWeight.toFixed(2)})`,
                path: 'header.totalWeightKg'
            });
        }

        return issues;
    }
};
