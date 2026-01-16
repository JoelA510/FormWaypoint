const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');
const SmsNotificationService = require('../services/cx/smsNotificationService');
const DigitalSignatureService = require('../services/cx/digitalSignatureService');

const smsService = new SmsNotificationService();
const signService = new DigitalSignatureService();

// --- Public Tracking ---

/**
 * GET /tracking/:id
 * Public endpoint to get shipment status.
 * Returns limited data (no sensitive price/cost info).
 */
router.get('/tracking/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const shipment = await prisma.shipment.findUnique({
            where: { id },
            select: {
                id: true,
                status: true,
                origin: true,
                destination: true,
                estimatedDelivery: true,
                carrier: true, // Only show carrier name presumably
                // NO cost/price data
            }
        });

        if (!shipment) {
            return res.status(404).json({ error: 'Shipment not found' });
        }

        res.json(shipment);
    } catch (error) {
        logger.error(`Tracking error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Returns Portal ---

/**
 * POST /returns/initiate
 * Public/Auth endpoint to start a return.
 */
router.post('/returns/initiate', async (req, res) => {
    try {
        const { originalShipmentId, reason } = req.body;

        // logic to find original shipment, verify eligibility (e.g. within 30 days)
        const shipment = await prisma.shipment.findUnique({ where: { id: originalShipmentId } });
        if (!shipment) {
            return res.status(404).json({ error: 'Original shipment not found' });
        }

        // Create return record (simplified)
        // In real app, we would likely have a 'ReturnAuth' model or create a new Shipment with type='RETURN'

        // For now, just echo back success
        res.json({
            message: 'Return initiated',
            rmanumber: 'RMA-' + Date.now(),
            status: 'PENDING_LABEL'
        });
    } catch (error) {
        logger.error(`Return init error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- SMS Notification Trigger (Admin/System) ---

router.post('/notify/sms', async (req, res) => {
    try {
        const { to, body } = req.body;
        await smsService.sendSms(to, body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send SMS' });
    }
});

// --- Digital Signature ---

router.post('/sign/:shipmentId', async (req, res) => {
    try {
        const { shipmentId } = req.params;
        const { signerName, signatureData, ipAddress } = req.body;

        const receipt = await signService.signShipment(shipmentId, signerName, signatureData, ipAddress || req.ip);
        res.json(receipt);
    } catch (error) {
        res.status(500).json({ error: 'Failed to record signature' });
    }
});

module.exports = router;
