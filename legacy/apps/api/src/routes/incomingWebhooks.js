const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');
const WebhookService = require('../services/dx/webhookService');

/**
 * POST /api/webhooks/carriers
 * Receives webhook events from carriers (EasyPost, FedEx, etc).
 * Normalizes status and updates shipment.
 */
router.post('/carriers', async (req, res) => {
    try {
        const payload = req.body;
        const providerHeader = req.headers['x-provider'] || 'generic'; // Or infer from payload structure

        logger.info(`Incoming Carrier Webhook (${providerHeader})`, { payload });

        let trackingNumber;
        let normalizedStatus;
        let eventType;

        // 1. Normalize Payload (Simplified Logic)
        if (payload.result && payload.result.tracking_code) {
            // EasyPost style?
            trackingNumber = payload.result.tracking_code;
            const status = payload.result.status; // pre_transit, in_transit, delivered
            normalizedStatus = status;
            eventType = `carrier.${status}`;
        } else if (payload.trackingNumber) {
            // Generic/Mock
            trackingNumber = payload.trackingNumber;
            normalizedStatus = payload.status;
            eventType = payload.event || 'shipment.updated';
        } else {
            // Fallback: try to find matching shipment by some ID?
            // For now, log and ignore unknown formats
            logger.warn('Unknown webhook format', payload);
            return res.status(200).send('Ignored');
        }

        // 2. Find Shipment
        const shipment = await prisma.shipment.findFirst({
            where: { trackingNumber }
        });

        if (!shipment) {
            logger.warn(`Webhook received for unknown tracking number: ${trackingNumber}`);
            return res.status(200).send('Shipment not found');
        }

        // 3. Update Shipment Status
        // Only update if status changed and is "forward" progress (optional check)
        if (shipment.status !== normalizedStatus) {
            await prisma.shipment.update({
                where: { id: shipment.id },
                data: {
                    status: normalizedStatus,
                    updatedAt: new Date()
                }
            });

            // 4. Trigger Outgoing Webhook (to User's System)
            // If the user has configured a webhook URL
            // We assume WebhookService handles finding the user's config? 
            // Actually WebhookService.sendWebhook takes (url, payload, secret).
            // We need to look up the user's webhook config.
            // For Phase 14, let's just log this handoff.

            logger.info(`Updated shipment ${shipment.id} to ${normalizedStatus}`);
        }

        res.status(200).send('OK');

    } catch (error) {
        logger.error('Webhook processing error', error);
        res.status(500).send('Error');
    }
});

module.exports = router;
