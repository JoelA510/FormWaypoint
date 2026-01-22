
const SYNONYM_MAP: Record<string, string[]> = {
    'trackingNumber': ['track', 'tracking', 'ref', 'reference', 'trk#', 'pro number'],
    'totalWeight': ['wgt', 'weight (lb)', 'weight (kg)', 'gross weight', 'mass', 'total weight'],
    'consignee': ['receiver', 'to', 'destination party', 'ship to'],
    'shipper': ['sender', 'from', 'origin party', 'ship from'],
    'incoterm': ['terms', 'incoterms', 'shipping terms'],
    'currency': ['curr', 'currency code'],
    'originCountry': ['origin', 'country of origin', 'coo', 'from country'],
    'destinationCountry': ['destination', 'dest', 'to country']
};

export class SemanticMapper {
    /**
     * Maps raw CSV headers to Canonical Schema fields using fuzzy matching.
     */
    static generateMapping(rawHeaders: string[]): Record<string, string> {
        const mapping: Record<string, string> = {};

        for (const header of rawHeaders) {
            const normalized = header.toLowerCase().trim();
            let match: string | null = null;

            // Direct Match check against keys
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
                mapping[header] = match;
            }
        }

        return mapping;
    }

    /**
     * Transform a raw row using the mapping.
     */
    static transform(rawRow: Record<string, any>, mapping: Record<string, string>): Record<string, any> {
        const canonical: Record<string, any> = {};
        for (const [rawKey, val] of Object.entries(rawRow)) {
            const canonicalKey = mapping[rawKey];
            if (canonicalKey) {
                canonical[canonicalKey] = val;
            } else {
                canonical[rawKey] = val; // Keep unmapped fields
            }
        }
        return canonical;
    }
}
