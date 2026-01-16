const TAG_RULES = [
    {
        tag: 'Invoice',
        keywords: ['invoice', 'bill of sale', 'amount due', 'total amount'],
        scoreThreshold: 1
    },
    {
        tag: 'Packing List',
        keywords: ['packing list', 'weight', 'net weight', 'gross weight', 'pcs', 'cartons'],
        scoreThreshold: 2
    },
    {
        tag: 'Certificate of Origin',
        keywords: ['certificate of origin', 'country of origin', 'certify that the goods'],
        scoreThreshold: 1
    },
    {
        tag: 'Bill of Lading',
        keywords: ['bill of lading', 'consignee', 'notify party', 'vessel', 'port of loading'],
        scoreThreshold: 2
    },
    {
        tag: 'Urgent',
        keywords: ['urgent', 'rush', 'immediate', 'asap'],
        scoreThreshold: 1
    }
];

class AutoTaggerService {

    constructor() { }

    /**
     * Analyze text and metadata to return a list of tags.
     * @param {string} text - The full text content of the document.
     * @param {string} filename - The original filename.
     * @returns {string[]} - Array of tags.
     */
    classify(text, filename = '') {
        const textLower = (text || '').toLowerCase();
        const filenameLower = (filename || '').toLowerCase();
        const foundTags = new Set();

        TAG_RULES.forEach(rule => {
            let score = 0;

            // Text analysis
            rule.keywords.forEach(keyword => {
                if (textLower.includes(keyword)) {
                    score += 1;
                }
            });

            // Filename boost
            if (rule.tag === 'Invoice' && filenameLower.includes('inv')) score += 2;
            if (rule.tag === 'Packing List' && (filenameLower.includes('pack') || filenameLower.includes('pl'))) score += 2;

            if (score >= rule.scoreThreshold) {
                foundTags.add(rule.tag);
            }
        });

        // Mutually exclusive logic (optional)
        // If Invoice and Packing List both found, try to disambiguate?
        // For now, allow multiple tags.

        return Array.from(foundTags);
    }
}

module.exports = new AutoTaggerService();
