const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../../utils/logger');

class SpotQuoteService {

    /**
     * Manually adds a spot quote to a shipment.
     */
    async addManualQuote(shipmentId, quoteData) {
        const { carrierName, amount, currency, validUntil } = quoteData;

        const quote = await prisma.spotQuote.create({
            data: {
                shipmentId,
                carrierName,
                amount,
                currency,
                validUntil,
                source: 'MANUAL',
                status: 'PENDING'
            }
        });

        logger.info(`Added manual spot quote to shipment ${shipmentId}: ${carrierName} - ${amount} ${currency}`);
        return quote;
    }

    /**
     * Simulates parsing an incoming email to extract quote details.
     * @param {string} emailBody 
     * @param {string} shipmentReference 
     */
    async parseEmailQuote(emailBody, shipmentReference) {
        // 1. Identify Shipment from reference (e.g., "Ref: SHIP-123")
        // Mocking lookup:
        const shipmentId = shipmentReference; // assume simplified match

        logger.info(`Parsing email quote for ${shipmentId}`);

        // 2. Use LLM or Regex to extract Price/Carrier
        // Regex for "$500" or "500 USD"
        const priceMatch = emailBody.match(/(\$|USD)\s?(\d+(?:\.\d{2})?)/i);
        const amount = priceMatch ? parseFloat(priceMatch[2]) : 0;

        // Regex for Carrier? Hard to do without context. LLM is better.
        const carrierName = "Email Carrier (Unknown)";

        if (amount > 0) {
            return await prisma.spotQuote.create({
                data: {
                    shipmentId,
                    carrierName,
                    amount,
                    currency: 'USD',
                    source: 'EMAIL',
                    status: 'PENDING'
                }
            });
        }

        throw new Error('Could not extract quote amount from email.');
    }

    async acceptQuote(quoteId) {
        return await prisma.spotQuote.update({
            where: { id: quoteId },
            data: { status: 'ACCEPTED' }
        });
    }
}

module.exports = SpotQuoteService;
