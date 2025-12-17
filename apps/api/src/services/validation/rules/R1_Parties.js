module.exports = {
    name: 'R1_Parties',
    validate: (shipment, lineItems) => {
        const issues = [];

        // HACK: Handling snapshots locally until mapped correctly in DB/DTO
        // In real app, shipment object might have relations or snapshots
        // Check both top-level fields (if mapped) or snapshot fields

        const shipperName = shipment.shipperName || (shipment.shipperSnapshot ? JSON.parse(shipment.shipperSnapshot).name : null);
        const consigneeName = shipment.consigneeName || (shipment.consigneeSnapshot ? JSON.parse(shipment.consigneeSnapshot).name : null);

        if (!shipperName) {
            issues.push({
                code: 'MISSING_SHIPPER',
                severity: 'error',
                message: 'Shipper name is required',
                path: 'header.shipper'
            });
        }

        if (!consigneeName) {
            issues.push({
                code: 'MISSING_CONSIGNEE',
                severity: 'error',
                message: 'Consignee name is required',
                path: 'header.consignee'
            });
        }

        return issues;
    }
};
