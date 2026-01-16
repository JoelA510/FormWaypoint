const crypto = require('crypto');
const axios = require('axios');
const logger = require('../../utils/logger');
// const { queue } = require('../../queue'); // Use shared queue

class WebhookService {
    /**
     * compute HMAC signature
     */
    signPayload(payload, secret) {
        return crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
    }

    /**
     * Dispatch webhook with retries (via queue ideally, direct here for brevity)
     * @param {string} url 
     * @param {Object} payload 
     * @param {string} secret 
     */
    async sendWebhook(url, payload, secret) {
        if (!url) return;

        const signature = this.signPayload(payload, secret);
        const headers = {
            'Content-Type': 'application/json',
            'X-FormWaypoint-Signature': `sha256=${signature}`,
            'User-Agent': 'FormWaypoint-Webhook/1.0'
        };

        try {
            await axios.post(url, payload, { headers, timeout: 5000 });
            logger.info(`[Webhook] Sent to ${url}`);
            return true;
        } catch (error) {
            logger.error(`[Webhook] Failed to send to ${url}: ${error.message}`);
            // In real impl: throw error to let BullMQ retry
            return false;
        }
    }
}

module.exports = new WebhookService();
