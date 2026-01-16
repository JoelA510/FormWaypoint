/**
 * @typedef {Object} CanonicalHeader
 * @property {string} shipper
 * @property {string} consignee
 * @property {string} incoterm
 * @property {string} currency
 * @property {string} [reference]
 */

/**
 * @typedef {Object} CanonicalLine
 * @property {string} partNumber
 * @property {string} description
 * @property {number} quantity
 * @property {number} netWeightKg
 * @property {number} valueUsd
 * @property {string} htsCode
 * @property {string} countryOfOrigin
 */

/**
 * @typedef {Object} CanonicalChecksums
 * @property {number} quantity
 * @property {number} netWeightKg
 * @property {number} valueUsd
 */

/**
 * @typedef {Object} CanonicalMeta
 * @property {string} sourceType
 * @property {Record<string, unknown>} raw
 * @property {Record<string, unknown>} normalization
 */

/**
 * @typedef {Object} CanonicalDoc
 * @property {CanonicalHeader} header
 * @property {CanonicalLine[]} lines
 * @property {CanonicalChecksums} checksums
 * @property {CanonicalMeta} meta
 */

module.exports = {};
