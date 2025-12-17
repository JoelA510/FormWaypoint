const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
    name: 'HtsValidation',
    validate: async (shipment, lineItems) => {
        const issues = [];
        if (!lineItems || lineItems.length === 0) return issues;

        for (let i = 0; i < lineItems.length; i++) {
            const item = lineItems[i];
            if (item.htsCode) {
                // Check if HTS code exists in DB
                const hts = await prisma.htsCode.findUnique({
                    where: { code: item.htsCode }
                });

                if (!hts) {
                    issues.push({
                        code: 'VAL-101',
                        severity: 'warning',
                        message: `HTS Code '${item.htsCode}' not found in reference database`,
                        path: `lineItems[${i}].htsCode`
                    });
                }
            } else {
                issues.push({
                    code: 'VAL-102',
                    severity: 'error',
                    message: 'HTS Code is missing',
                    path: `lineItems[${i}].htsCode`
                });
            }
        }
        return issues;
    }
};
