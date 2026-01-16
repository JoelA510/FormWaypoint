module.exports = {
    name: 'R5_Eei',
    validate: (shipment, lineItems) => {
        const issues = [];
        const EEI_THRESHOLD = 2500;

        // Skip if destination is Canada (common exemption) or US (domestic)
        const dest = (shipment.destinationCountry || '').toUpperCase();
        if (dest === 'CA' || dest === 'US') {
            return issues;
        }

        const highValueLines = lineItems.filter(l => (l.extendedValue || 0) > EEI_THRESHOLD);

        if (highValueLines.length > 0) {
            // Check if exemption or ITN is present
            const hasAuth = shipment.aesItn || shipment.eeiExemptionCode;

            if (!hasAuth) {
                issues.push({
                    code: 'EEI_REQUIRED',
                    severity: 'warning',
                    message: `Shipment contains line(s) over $${EEI_THRESHOLD}. AES ITN or Exemption Code likely required.`,
                    path: 'header.aesItn'
                });
            }
        }

        return issues;
    }
};
