const logger = require('../../utils/logger');

// Common synonyms for canonical fields
const SYNONYM_MAP = {
    'trackingNumber': ['track', 'tracking', 'ref', 'reference', 'trk#', 'pro number'],
    'weight': ['wgt', 'weight (lb)', 'weight (kg)', 'gross weight', 'mass'],
    'consignee': ['receiver', 'to', 'destination party', 'ship to'],
    'shipper': ['sender', 'from', 'origin party', 'ship from']
};

class SemanticMapper {

    /**
     * Maps raw CSV headers to Canonical Schema fields using fuzzy matching.
     * @param {string[]} rawHeaders 
     * @returns {Object} Mapping object { "Raw Header": "canonicalField" }
     */
    generateMapping(rawHeaders) {
        const mapping = {};

        for (const header of rawHeaders) {
            const normalized = header.toLowerCase().trim();
            let match = null;

            // Direct Match
            if (SYNONYM_MAP[normalized]) match = normalized;

            // Synonym Match
            if (!match) {
                for (const [canonical, synonyms] of Object.entries(SYNONYM_MAP)) {
                    if (synonyms.some(s => normalized.includes(s))) {
                        match = canonical;
                        break;
                    }
                }
            }

            if (match) {
                logger.info(`Mapped "${header}" -> "${match}"`);
                mapping[header] = match;
            }
        }

        return mapping;
    }

    /**
     * Transform a raw row using the mapping.
     * @param {Object} rawRow 
     * @param {Object} mapping 
     */
    transform(rawRow, mapping) {
        const canonical = {};
        for (const [rawKey, val] of Object.entries(rawRow)) {
            const canonicalKey = mapping[rawKey];
            if (canonicalKey) {
                canonical[canonicalKey] = val;
            } else {
                canonical[rawKey] = val; // Keep unmapped fields?
            }
        }
        return canonical;
    }
}

module.exports = new SemanticMapper();
