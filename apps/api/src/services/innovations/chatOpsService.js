const logger = require('../../utils/logger');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ChatOpsService {

    /**
     * Processes an incoming slash command from Slack/Teams.
     * @param {string} command - e.g. "/fwp track 123"
     * @param {string} userId - Platform user ID
     */
    async processCommand(command, userId) {
        logger.info(`ChatOps command from ${userId}: ${command}`);

        const parts = command.split(' ');
        const action = parts[0].toLowerCase(); // /fwp (removed) -> track

        if (action === 'track') {
            const trackingNumber = parts[1];
            const shipment = await prisma.shipment.findFirst({
                where: { trackingNumber }
            });

            if (shipment) {
                return `Shipment ${shipment.id} is currently ${shipment.status}. ETA: ${shipment.estimatedDelivery || 'N/A'}`;
            } else {
                return `No shipment found with tracking number ${trackingNumber}`;
            }
        }

        if (action === 'stats') {
            const count = await prisma.shipment.count({
                where: { status: 'in_transit' }
            });
            return `There are currently ${count} shipments in transit.`;
        }

        return "Unknown command. Try: track <number>, stats";
    }

    /**
     * Sends a notification to a specific channel.
     * @param {string} channelId 
     * @param {string} message 
     */
    async sendNotification(channelId, message) {
        // Mock HTTP post to Slack Webhook
        logger.info(`Sending ChatOps message to ${channelId}: ${message}`);
        return true;
    }
}

module.exports = ChatOpsService;
