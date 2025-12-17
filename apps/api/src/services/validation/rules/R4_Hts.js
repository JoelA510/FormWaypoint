module.exports = {
    name: 'R4_Hts',
    validate: (shipment, lineItems) => {
        const issues = [];

        lineItems.forEach((line, index) => {
            const hts = line.htsCode;
            if (!hts) {
                issues.push({
                    code: 'MISSING_HTS',
                    severity: 'error',
                    message: 'HTS Code is required',
                    path: `lines[${index}].htsCode`
                });
            } else {
                // Remove dots/spaces
                const cleanHts = hts.replace(/[^0-9]/g, '');
                if (cleanHts.length < 6) {
                    issues.push({
                        code: 'INVALID_HTS',
                        severity: 'warning',
                        message: `HTS Code "${hts}" appears too short (expected 6+ digits)`,
                        path: `lines[${index}].htsCode`
                    });
                }
            }
        });

        return issues;
    }
};
