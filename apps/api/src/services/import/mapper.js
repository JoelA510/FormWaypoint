/**
 * Maps raw CSV row to Shipment Canonical Schema
 * This is a basic V1 mapper that assumes strict column naming or provides defaults.
 * In a real app, this would be configuration-driven.
 */

// Default mappings (CSV Header -> Canonical Field)
const COLUMN_MAP = {
    // Shipment Level
    'incoterm': 'incoterm',
    'currency': 'currency',
    'origin': 'originCountry',
    'destination': 'destinationCountry',
    'po': 'erpOrderId',
    'ref': 'erpShipmentId',

    // Line Level
    'sku': 'sku',
    'description': 'description',
    'qty': 'quantity',
    'quantity': 'quantity',
    'value': 'unitValue',
    'price': 'unitValue',
    'weight': 'netWeightKg',
    'netweight': 'netWeightKg',
    'hts': 'htsCode',
    'coo': 'countryOfOrigin',

    // Parties (Simplified - usually these are complexes)
    'shipper': 'shipperName',
    'consignee': 'consigneeName'
};

/**
 * Transforms parsed rows into a single Shipment setup.
 * For Phase 1, we assume 1 CSV = 1 Shipment (bulk lines).
 */
function mapRowsToUnknownShipment(rows) {
    if (!rows || rows.length === 0) return null;

    // 1. Extract Header Info from the first row (or aggregation)
    const firstRow = rows[0];

    // Helper to find value by possible keys
    const getValue = (row, ...keys) => {
        for (const k of keys) {
            // Case-insensitive lookup
            const foundKey = Object.keys(row).find(rk => rk.toLowerCase() === k.toLowerCase());
            if (foundKey) return row[foundKey];
        }
        return null;
    };

    const header = {
        incoterm: getValue(firstRow, 'incoterm', 'terms') || 'EXW',
        currency: getValue(firstRow, 'currency', 'curr') || 'USD',
        originCountry: getValue(firstRow, 'origin', 'coo', 'originCountry') || 'US',
        destinationCountry: getValue(firstRow, 'destination', 'dest', 'destinationCountry') || 'US',
        erpOrderId: getValue(firstRow, 'po', 'order', 'ref'),
        totalCustomsValue: 0, // Computed below
        totalWeightKg: 0, // Computed below
        numPackages: 0 // Computed below
    };

    // 2. Map Lines
    const lines = rows.map(row => {
        const qty = Number(getValue(row, 'qty', 'quantity', 'units') || 0);
        const val = Number(getValue(row, 'price', 'value', 'unitValue') || 0);
        const wt = Number(getValue(row, 'weight', 'netWeight', 'kg') || 0);

        return {
            description: getValue(row, 'description', 'desc', 'item') || 'Unknown Item',
            quantity: qty,
            unitValue: val,
            extendedValue: qty * val,
            netWeightKg: wt,
            htsCode: getValue(row, 'hts', 'hs', 'scheduleb') || '0000000000',
            countryOfOrigin: getValue(row, 'coo', 'origin') || header.originCountry || 'US'
        };
    });

    // 3. Aggregate Totals
    header.totalCustomsValue = lines.reduce((sum, l) => sum + l.extendedValue, 0);
    header.totalWeightKg = lines.reduce((sum, l) => sum + l.netWeightKg, 0);
    header.numPackages = lines.length; // Naive assumption: 1 line = 1 pkg if not specified

    return {
        header,
        lines
    };
}

module.exports = { mapRowsToUnknownShipment };
