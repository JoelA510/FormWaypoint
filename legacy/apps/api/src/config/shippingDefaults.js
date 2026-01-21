/**
 * Centralized defaults for shipment generation and validation.
 */
module.exports = {
    DEFAULT_CURRENCY: process.env.DEFAULT_CURRENCY || 'USD',
    DEFAULT_INCOTERM: process.env.DEFAULT_INCOTERM || 'EXW',
    DEFAULT_ORIGIN_COUNTRY: process.env.DEFAULT_ORIGIN_COUNTRY || null,
    DEFAULT_DEST_COUNTRY: process.env.DEFAULT_DEST_COUNTRY || null,
    DEFAULT_WEIGHT_UNIT: process.env.DEFAULT_WEIGHT_UNIT || 'kg',
    DEFAULT_DIMENSION_UNIT: process.env.DEFAULT_DIMENSION_UNIT || 'cm'
};
