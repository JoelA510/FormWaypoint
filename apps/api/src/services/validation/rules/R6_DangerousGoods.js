module.exports = {
    name: 'R6_DangerousGoods',
    validate: (shipment, lineItems) => {
        const issues = [];

        // Check if shipment is marked as containing DG
        const isDgShipment = shipment.hasDangerousGoods;

        // Check if any line is DG
        const dgLines = lineItems.filter(l => l.isDangerousGoods);

        if (dgLines.length > 0 && !isDgShipment) {
            issues.push({
                code: 'DG_MISMATCH',
                severity: 'warning',
                message: 'Shipment contains DG lines but header "hasDangerousGoods" is false',
                path: 'header.hasDangerousGoods'
            });
        }

        dgLines.forEach((line, index) => {
            if (!line.dgUnNumber || !line.dgHazardClass) {
                issues.push({
                    code: 'DG_INCOMPLETE',
                    severity: 'error',
                    message: 'Dangerous Goods lines must have UN Number and Hazard Class',
                    path: `lines[${index}].dgUnNumber`
                });
            }
        });

        return issues;
    }
};
