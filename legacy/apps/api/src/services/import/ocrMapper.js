/**
 * Maps the generic Ingestion Result (CanonicalDoc) to the ShipmentV1 schema.
 * 
 * @param {import('../../../../../services/ingestion/src/types').CanonicalDoc} ocrResult 
 * @returns {Object} ShipmentV1 compatible object
 */
const crypto = require('crypto');
const { ShipmentV1Schema } = require('@formwaypoint/schemas');
const {
    DEFAULT_CURRENCY,
    DEFAULT_INCOTERM,
    DEFAULT_ORIGIN_COUNTRY,
    DEFAULT_DEST_COUNTRY
} = require('../../config/shippingDefaults');

/**
 * Maps the generic Ingestion Result (CanonicalDoc) to the ShipmentV1 schema.
 * 
 * @param {import('../../../../../services/ingestion/src/types').CanonicalDoc} ocrResult 
 * @returns {Object} ShipmentV1 compatible object
 */
function mapOcrToShipment(ocrResult) {
    if (!ocrResult || !ocrResult.header) {
        throw new Error('Invalid OCR result: missing header');
    }

    const { header, lines } = ocrResult;
    const shipmentId = crypto.randomUUID();

    // Map Lines
    const shipmentLines = lines.map(line => ({
        id: crypto.randomUUID(),
        shipmentId: shipmentId,
        description: line.description || 'Unknown Item',
        quantity: line.quantity || 1,
        uom: line.quantityUom || 'EA',
        unitValue: line.valueUsd && line.quantity ? (line.valueUsd / line.quantity) : 0,
        extendedValue: line.valueUsd || 0,
        netWeightKg: line.netWeightKg || 0,
        htsCode: line.htsCode || '000000',
        countryOfOrigin: line.countryOfOrigin || DEFAULT_ORIGIN_COUNTRY,
        sku: line.partNumber
    }));

    // Calculate aggregates first to ensure validity
    const aggValue = ocrResult.checksums?.valueUsd || lines.reduce((acc, line) => acc + (line.valueUsd || 0), 0);
    const aggWeight = ocrResult.checksums?.netWeightKg || lines.reduce((acc, line) => acc + (line.netWeightKg || 0), 0);
    const aggQty = ocrResult.checksums?.quantity || lines.reduce((acc, line) => acc + (line.quantity || 0), 0);

    const originCountry = header.originCountry || header.origin || DEFAULT_ORIGIN_COUNTRY;
    const destinationCountry = header.destinationCountry || header.destination || DEFAULT_DEST_COUNTRY;

    // Map Header
    const shipmentData = {
        id: shipmentId,
        schemaVersion: 'shipment.v1',
        incoterm: header.incoterm || DEFAULT_INCOTERM,
        currency: header.currency || DEFAULT_CURRENCY,
        originCountry,
        destinationCountry,
        erpOrderId: header.reference,

        shipper: {
            id: crypto.randomUUID(),
            name: header.shipper || 'Unknown Shipper',
            addressLine1: 'Unknown Address',
            city: 'Unknown City',
            postalCode: '00000',
            countryCode: originCountry
        },
        consignee: {
            id: crypto.randomUUID(),
            name: header.consignee || 'Unknown Consignee',
            addressLine1: 'Unknown Address',
            city: 'Unknown City',
            postalCode: '00000',
            countryCode: destinationCountry
        },

        // Aggregates
        totalCustomsValue: aggValue >= 0 ? aggValue : 0,
        totalWeightKg: aggWeight >= 0 ? aggWeight : 0,
        numPackages: aggQty > 0 ? aggQty : 1, // Default to 1 to satisfy .positive()

        lineItems: shipmentLines,

        // Metadata required by schema
        createdAt: new Date(),
        updatedAt: new Date(),
        createdByUserId: 'system-ocr',
    };

    // optional: Validate against schema (warn or throw)
    try {
        return ShipmentV1Schema.parse(shipmentData);
    } catch (err) {
        console.error('OCR Mapping Validation Failed:', err.errors);
        throw new Error(`OCR Validation Failed: ${err.message}`);
    }
}

module.exports = {
    mapOcrToShipment
};
