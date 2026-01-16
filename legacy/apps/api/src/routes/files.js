const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

router.get('/:filename', async (req, res) => {
    const { filename } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // Basic path traversal protection
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    try {
        let isAuthorized = false;

        // 1. Check ShipmentDocument (Generated files)
        const shipmentDoc = await prisma.shipmentDocument.findFirst({
            where: { storageKey: filename },
            include: { shipment: true }
        });

        if (shipmentDoc) {
            if (userRole === 'admin' || shipmentDoc.shipment.createdByUserId === userId) {
                isAuthorized = true;
            }
        }

        // 2. Check Source Documents linked to Shipments
        if (!isAuthorized) {
            const linkedShipment = await prisma.shipment.findFirst({
                where: {
                    sourceDocument: {
                        filename: filename
                    }
                }
            });

            if (linkedShipment) {
                if (userRole === 'admin' || linkedShipment.createdByUserId === userId) {
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized) {
            // Log attempt
            console.warn(`[Security] Unauthorized file access attempt by user ${userId} for ${filename}`);
            // Return 404 to prevent enumeration, or 403 if we want to be explicit. 
            // 404 is safer for static assets.
            return res.status(404).json({ error: 'File not found or access denied' });
        }

        const filePath = path.join(config.storage.path, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Stream the file
        res.sendFile(filePath);

    } catch (error) {
        console.error('File serving error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
