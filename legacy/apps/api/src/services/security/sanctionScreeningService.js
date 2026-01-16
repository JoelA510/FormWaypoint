const { prisma } = require('../../queue');

class SanctionScreeningService {
    /**
     * Screen a party (Sender/Receiver) against blocked lists.
     * Uses fuzzy matching logic (Mocked).
     * @param {Object} party 
     */
    async screenParty(party) {
        // Simplified matching logic
        const blockedNames = ['EVIL CORP', 'BLOCKED ENTITY', 'EMBARGOED LLC'];

        let matchScore = 0;
        let matchedName = null;
        let sourceList = null;

        const nameUpper = party.name.toUpperCase();

        // Exact match simulation
        if (blockedNames.includes(nameUpper)) {
            matchScore = 1.0;
            matchedName = nameUpper;
            sourceList = 'OFAC_SDN';
        } else if (nameUpper.includes('EVIL')) {
            matchScore = 0.8; // Partial
            matchedName = 'EVIL ...';
            sourceList = 'BIS_ENTITY';
        }

        // Log the check
        const check = await prisma.sanctionCheck.create({
            data: {
                entityName: party.name,
                matchScore,
                sourceList: sourceList || 'N/A',
                status: matchScore > 0.9 ? 'BLOCKED' : (matchScore > 0.7 ? 'REVIEW_REQUIRED' : 'CLEARED')
            }
        });

        if (check.status === 'BLOCKED') {
            throw new Error(`Shipment Blocked: Party ${party.name} matches restricted list (${sourceList})`);
        }

        return check;
    }
}

module.exports = new SanctionScreeningService();
