const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');

// --- Drivers ---

router.get('/drivers', async (req, res) => {
    const drivers = await prisma.driver.findMany({
        where: { status: { not: 'deleted' } },
        include: { vehicle: true }
    });
    res.json(drivers);
});

router.post('/drivers', async (req, res) => {
    try {
        const { name, phone, licenseNumber, type } = req.body;
        const driver = await prisma.driver.create({
            data: { name, phone, licenseNumber, type, status: 'active' }
        });
        res.json(driver);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Vehicles ---

router.get('/vehicles', async (req, res) => {
    const vehicles = await prisma.vehicle.findMany({
        where: { status: { not: 'deleted' } }
    });
    res.json(vehicles);
});

router.post('/vehicles', async (req, res) => {
    try {
        const { name, licensePlate, type, capacityKg } = req.body;
        const vehicle = await prisma.vehicle.create({
            data: { name, licensePlate, type, capacityKg: parseFloat(capacityKg) }
        });
        res.json(vehicle);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Dispatch ---

/**
 * POST /api/fleet/dispatch/assign
 * Assign a shipment to a driver/vehicle.
 */
router.post('/dispatch/assign', async (req, res) => {
    const { shipmentId, driverId, vehicleId } = req.body;

    try {
        // Validation: Check driver availability? (Skipping for MVP)

        const updateData = {};
        if (driverId) updateData.driverId = driverId;
        // Note: Shipment schema currently only has driverId, not vehicleId directly (inferred from driver?)
        // Or we might need to add vehicleId to shipment if asset-based?
        // Let's assume driver has a vehicle assigned, or we update the driver's vehicle too?

        // Update Shipment
        const shipment = await prisma.shipment.update({
            where: { id: shipmentId },
            data: {
                ...updateData,
                status: 'ready_to_book' // or 'dispatched'?
            }
        });

        // Notify Driver (Phase 15.3 Mobile)
        // triggerPushNotification(driverId, "New Order Assigned");

        res.json(shipment);

    } catch (e) {
        logger.error('Dispatch error', e);
        res.status(500).json({ error: 'Failed to dispatch' });
    }
});

// --- Driver Mobile App (PWA) ---

/**
 * GET /api/fleet/driver/manifest
 * Get assigned shipments for the authenticated driver.
 */
router.get('/driver/manifest', async (req, res) => {
    // Assuming req.user is linked to a Driver record
    // For now, pass driverId as query param for testing
    const driverId = req.query.driverId; // || req.user.driverId

    if (!driverId) return res.status(400).json({ error: 'Driver ID required' });

    const shipments = await prisma.shipment.findMany({
        where: {
            driverId: driverId,
            status: { in: ['ready_to_book', 'dispatched', 'in_transit'] }
        },
        select: {
            id: true,
            status: true,
            dueDate: true,
            originCountry: true,
            destinationCountry: true,
            totalWeightKg: true,
            numPackages: true,
            shipper: {
                select: {
                    id: true,
                    name: true,
                    addressLine1: true,
                    addressLine2: true,
                    city: true,
                    stateOrProvince: true,
                    postalCode: true,
                    countryCode: true,
                    contactName: true,
                    phone: true
                }
            },
            consignee: {
                select: {
                    id: true,
                    name: true,
                    addressLine1: true,
                    addressLine2: true,
                    city: true,
                    stateOrProvince: true,
                    postalCode: true,
                    countryCode: true,
                    contactName: true,
                    phone: true
                }
            }
        },
        orderBy: {
            dueDate: 'asc'
        }
    });

    res.json(shipments);
});

/**
 * POST /api/fleet/driver/update_status
 * Driver updates job status (Arrived, Completed).
 */
router.post('/driver/update_status', async (req, res) => {
    const { shipmentId, status, lat, lng, proofUrl } = req.body;
    // status: 'arrived_pickup', 'picked_up', 'arrived_delivery', 'completed'

    logger.info(`Driver update for ${shipmentId}: ${status}`);

    // Update shipment
    const updated = await prisma.shipment.update({
        where: { id: shipmentId },
        data: {
            status, // Map to canonical status if needed
            // log location?
        }
    });

    if (lat && lng) {
        // Log driver location history (Future: FleetMap replay)
        // await prisma.driverLocation.create(...)
    }

    res.json({ success: true, status: updated.status });
});


module.exports = router;
