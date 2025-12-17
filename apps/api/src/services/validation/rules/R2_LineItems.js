module.exports = {
    name: 'R2_LineItems',
    validate: (shipment, lineItems) => {
        const issues = [];

        if (!lineItems || lineItems.length === 0) {
            return [{
                code: 'NO_LINE_ITEMS',
                severity: 'error',
                message: 'Shipment must have at least one line item',
                path: 'lines'
            }];
        }

        lineItems.forEach((line, index) => {
            const pathPrefix = `lines[${index}]`;

            if (!line.description) {
                issues.push({
                    code: 'MISSING_DESCRIPTION',
                    severity: 'error',
                    message: 'Line item description is required',
                    path: `${pathPrefix}.description`
                });
            }

            if (line.quantity === undefined || line.quantity === null || line.quantity <= 0) {
                issues.push({
                    code: 'INVALID_QUANTITY',
                    severity: 'error',
                    message: 'Quantity must be greater than 0',
                    path: `${pathPrefix}.quantity`
                });
            }

            if (line.unitValue === undefined || line.unitValue === null || line.unitValue < 0) {
                issues.push({
                    code: 'INVALID_VALUE',
                    severity: 'error',
                    message: 'Unit value cannot be negative',
                    path: `${pathPrefix}.unitValue`
                });
            }
        });

        return issues;
    }
};
