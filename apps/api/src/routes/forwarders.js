const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bookingPackageService = require('../services/forwarders/bookingPackageService');

// Middleware to mock user ID if auth not fully set up in tests
const getUserId = (req) => req.user?.id || 'mock-user-id';

/**
 * GET /api/forwarders
 * List all forwarder profiles for the current user.
 */
router.get('/', async (req, res) => {
    try {
        const userId = getUserId(req);
        const profiles = await prisma.forwarderProfile.findMany({
            where: { userId },
            orderBy: { name: 'asc' }
        });

        // Parse JSON fields for the frontend
        const parsedProfiles = profiles.map(p => ({
            ...p,
            emailTo: JSON.parse(p.emailToJson || '[]'),
            emailCc: JSON.parse(p.emailCcJson || '[]'),
            attachmentTypes: JSON.parse(p.attachmentTypesJson || '[]')
        }));

        res.json(parsedProfiles);
    } catch (error) {
        console.error('Error listing forwarders:', error);
        res.status(500).json({ error: 'Failed to list forwarder profiles' });
    }
});

/**
 * POST /api/forwarders
 * Create a new forwarder profile.
 */
router.post('/', async (req, res) => {
    try {
        const userId = getUserId(req);
        const {
            name,
            emailTo = [],
            emailCc = [],
            emailSubjectTemplate = '',
            emailBodyTemplate = '',
            dataBundleFormat = 'CSV', // CSV, JSON, NONE
            attachmentTypes = ['SLI']
        } = req.body;

        const profile = await prisma.forwarderProfile.create({
            data: {
                userId,
                name,
                emailToJson: JSON.stringify(emailTo),
                emailCcJson: JSON.stringify(emailCc),
                emailSubjectTemplate,
                emailBodyTemplate,
                dataBundleFormat,
                attachmentTypesJson: JSON.stringify(attachmentTypes)
            }
        });

        res.status(201).json(profile);
    } catch (error) {
        console.error('Error creating forwarder:', error);
        res.status(500).json({ error: 'Failed to create forwarder profile' });
    }
});

/**
 * POST /api/shipments/:id/forwarder-booking
 * Generate a booking package (email + data bundle) using a specific profile.
 */
router.post('/shipments/:id/booking', async (req, res) => { // NOTE: Route is mounted at /api/forwarders, so url is /api/forwarders/shipments/:id/booking
    try {
        const { id } = req.params;
        const { profileId } = req.body;

        if (!profileId) {
            return res.status(400).json({ error: 'Missing profileId' });
        }

        const profile = await prisma.forwarderProfile.findUnique({
            where: { id: profileId }
        });

        if (!profile) {
            return res.status(404).json({ error: 'Forwarder profile not found' });
        }

        // 1. Build View Model
        const viewModel = await bookingPackageService.buildViewModel(id);

        // 2. Render Email
        const emailData = bookingPackageService.renderEmail(profile, viewModel);

        // 3. Generate Data Bundle (if applicable)
        let bundleData = null;
        let bundleFilename = null;

        if (profile.dataBundleFormat === 'CSV') {
            bundleData = bookingPackageService.generateCsvBundle(viewModel);
            bundleFilename = `Booking_${viewModel.shipment.id}.csv`;
        } else if (profile.dataBundleFormat === 'JSON') {
            bundleData = bookingPackageService.generateJsonBundle(viewModel);
            bundleFilename = `Booking_${viewModel.shipment.id}.json`;
        }

        // Return everything to UI
        res.json({
            success: true,
            email: emailData,
            bundle: bundleData ? {
                filename: bundleFilename,
                content: bundleData, // In real app, might separate this or base64 encode if binary
                format: profile.dataBundleFormat
            } : null
        });

    } catch (error) {
        console.error('Error generating booking:', error);
        res.status(500).json({ error: error.message || 'Failed to generate booking package' });
    }
});

module.exports = router;
