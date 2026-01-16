const logger = require('../../utils/logger');
// const twilio = require('twilio'); // Uncomment when real integration is needed

class SmsNotificationService {
    constructor(accountSid, authToken, fromNumber) {
        this.accountSid = accountSid || process.env.TWILIO_ACCOUNT_SID;
        this.authToken = authToken || process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = fromNumber || process.env.TWILIO_FROM_NUMBER;

        if (this.accountSid && this.authToken) {
            // this.client = twilio(this.accountSid, this.authToken);
            this.client = { messages: { create: async (obj) => ({ sid: 'mock_sid_' + Date.now(), ...obj }) } }; // Mock for now
        } else {
            this.client = null;
        }
    }

    async sendSms(to, body) {
        if (!this.client) {
            logger.warn('Twilio credentials not configured. SMS suppressed.');
            return;
        }

        try {
            const message = await this.client.messages.create({
                body,
                from: this.fromNumber,
                to
            });
            logger.info(`SMS sent to ${to}: ${message.sid}`);
            return message;
        } catch (error) {
            logger.error(`Failed to send SMS to ${to}: ${error.message}`);
            throw error;
        }
    }

    generateTrackingMessage(shipmentId, status, trackingUrl) {
        return `Update for shipment ${shipmentId}: Status is now ${status}. Track here: ${trackingUrl}`;
    }
}

module.exports = SmsNotificationService;
