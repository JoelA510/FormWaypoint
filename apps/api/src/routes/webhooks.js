const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');

/**
 * POST /api/webhooks/carriers
 * Receives webhook events from carriers (EasyPost, FedEx, etc).
 * Normalizes status and updates shipment.
 */
router.post('/carriers', async (req, res) => {
    try {
        const payload = req.body;
        const providerHeader = req.headers['x-provider'] || 'generic';

        logger.info(`Incoming Carrier Webhook (${providerHeader})`, { payload });

        let trackingNumber;
        let normalizedStatus;

        // 1. Normalize Payload
        if (payload.result && payload.result.tracking_code) {
            // EasyPost style
            trackingNumber = payload.result.tracking_code;
            normalizedStatus = payload.result.status;
        } else if (payload.trackingNumber) {
            // Generic/Mock
            trackingNumber = payload.trackingNumber;
            normalizedStatus = payload.status;
        } else {
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

        // 3. Update Status
        if (shipment.status !== normalizedStatus) {
            await prisma.shipment.update({
                where: { id: shipment.id },
                data: {
                    status: normalizedStatus,
                    updatedAt: new Date()
                }
            });
            logger.info(`Updated shipment ${shipment.id} to ${normalizedStatus}`);
        }

        res.status(200).send('OK');

    } catch (error) {
        logger.error('Webhook processing error', error);
        res.status(500).send('Error');
    }
});

module.exports = router;
