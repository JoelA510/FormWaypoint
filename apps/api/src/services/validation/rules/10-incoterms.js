const INCOTERMS = [
    'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', // Any Mode
    'FAS', 'FOB', 'CFR', 'CIF' // Sea/Inland Waterway
];

module.exports = {
    name: 'IncotermValidation',
    validate: (shipment) => {
        const issues = [];
        if (!shipment.incoterm) {
            issues.push({
                code: 'VAL-001',
                severity: 'error',
                message: 'Incoterm is required',
                path: 'incoterm'
            });
        } else if (!INCOTERMS.includes(shipment.incoterm)) {
            issues.push({
                code: 'VAL-002',
                severity: 'warning',
                message: `Incoterm '${shipment.incoterm}' is not a standard 2020 Incoterm`,
                path: 'incoterm'
            });
        }
        return issues;
    }
};
