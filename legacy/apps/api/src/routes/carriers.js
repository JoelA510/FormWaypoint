const express = require('express');
const router = express.Router();
const prisma = require('../db');
const CarrierFactory = require('../gateways/carriers/CarrierFactory');
const { generateDocument } = require('../services/documents/generator');

/**
 * GET /api/shipments/:id/rates
 * Trigger a rate shop for a shipment.
 */
const crypto = require('crypto');
const { connection: redis } = require('../services/redis');
const logger = require('../utils/logger');
const { encryptValue, decryptValue } = require('../utils/encryption');

// ...

const LBS_TO_KG = 0.453592;

const maskAccountNumber = (value) => {
    if (!value) return null;
    const compact = value.replace(/\s+/g, '');
    if (compact.length <= 4) return compact;
    return `${'*'.repeat(compact.length - 4)}${compact.slice(-4)}`;
};

const safeDecrypt = (value, accountId, fieldName) => {
    try {
        return decryptValue(value);
    } catch (error) {
        logger.warn('Failed to decrypt carrier account field.', {
            accountId,
            fieldName,
            error: error.message
        });
        return null;
    }
};

/**
 * POST /api/carriers/rates
 * Ad-hoc rate shopping (no saved shipment required).
 * Normalizes units (LBS -> KG) before calling gateways.
 */
router.post('/rates', async (req, res) => {
    try {
        const { shipment } = req.body;

        if (!shipment || !shipment.from || !shipment.to || !shipment.package) {
            return res.status(400).json({ error: 'Invalid shipment data' });
        }

        // 1. Normalize Weight (LBS -> KG)
        // Default to LBS if not specified, as that's what the UI sends currently
        let weightKg = parseFloat(shipment.package.weight);
        const unit = shipment.package.weightUnit || 'lb';

        if (unit.toLowerCase() === 'lb' || unit.toLowerCase() === 'lbs') {
            weightKg = weightKg * LBS_TO_KG;
        }

        // 2. Construct Normalized Shipment Object for Gateways
        // Gateways expect a specific shape (similar to Prisma model)
        const normalizedShipment = {
            originCountry: shipment.from.country || 'US',
            destinationCountry: shipment.to.country || 'US',
            totalWeightKg: weightKg,
            // Mock line items if not provided (ad-hoc usually just has weight)
            lineItems: []
        };

        // 3. Get Active Carrier Accounts for User
        const carrierAccounts = await prisma.carrierAccount.findMany({
            where: {
                isActive: true,
                userId: req.user.id
            }
        });

        if (carrierAccounts.length === 0) {
            // For ad-hoc, maybe return empty list instead of 400? 
            // But UI expects rates or error. Let's return empty list to avoid blocking UI flow if just testing.
            // Actually, existing behavior was 400. Let's stick to consistent behavior or empty.
            // Better to return empty list so UI says "No rates found" rather than "Error".
            return res.json({ data: [] });
        }

        // 4. Rate Shop
        const ratesPromises = carrierAccounts.map(async (account) => {
            try {
                const gateway = await CarrierFactory.getGateway(account.id);
                // internal gateways expect (shipment, lineItems)
                const rates = await gateway.getRates(normalizedShipment, []);
                return rates.map(r => ({ ...r, carrierAccountId: account.id, provider: account.provider }));
            } catch (err) {
                logger.error('Ad-hoc rate shop error', { accountId: account.id, error: err.message });
                return [];
            }
        });

        const nestedRates = await Promise.all(ratesPromises);
        const allRates = nestedRates.flat();

        res.json({ data: allRates });

    } catch (error) {
        logger.error('Ad-hoc rate shop failed', { error: error.message });
        res.status(500).json({ error: 'Failed to shop rates' });
    }
});

/**
 * GET /api/carriers/schema/:provider
 * Returns the form schema for connecting a carrier.
 */
router.get('/schema/:provider', (req, res) => {
    const { provider } = req.params;
    const schema = CarrierFactory.getProviderSchema(provider);
    res.json(schema);
});

/**
 * POST /api/carriers/connect
 * Connects a new carrier account after validation.
 */
router.post('/connect', async (req, res) => {
    const { provider, credentials, accountNumber, description, userId } = req.body;

    try {
        // 1. Validate Credentials against Carrier API
        const isValid = await CarrierFactory.validateCredentials(provider, credentials, accountNumber);

        if (!isValid) {
            return res.status(400).json({ error: 'Invalid credentials. Carrier rejected the connection.' });
        }

        // 2. Save Account
        const account = await prisma.carrierAccount.create({
            data: {
                userId: userId || req.user?.id,
                provider: provider.toLowerCase(),
                accountNumber: encryptValue(accountNumber),
                credentials: encryptValue(JSON.stringify(credentials)),
                description,
                isActive: true
            }
        });

        logger.info(`Carrier account connected: ${provider} (${account.id})`);
        res.json(account);

    } catch (error) {
        logger.error(`Connection error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/carriers
 * List connected accounts for user.
 */
router.get('/', async (req, res) => {
    const userId = req.user?.id || req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    const accounts = await prisma.carrierAccount.findMany({
        where: { userId }
    });

    // Don't return full credentials
    const sanitized = accounts.map(a => {
        const decryptedAccountNumber = safeDecrypt(a.accountNumber, a.id, 'accountNumber');
        return {
            id: a.id,
            provider: a.provider,
            description: a.description,
            accountNumber: maskAccountNumber(decryptedAccountNumber),
            isActive: a.isActive
        };
    });

    res.json(sanitized);
});

router.post('/:id/rates', async (req, res) => {
    try {
        const { id } = req.params;
        const shipment = await prisma.shipment.findUnique({
            where: { id },
            include: { lineItems: true }
        });

        if (!shipment) {
            return res.status(404).json({ error: 'Shipment not found' });
        }

        // Security Check: Shipment Ownership
        if (shipment.createdByUserId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied to shipment' });
        }

        const carrierAccounts = await prisma.carrierAccount.findMany({
            where: {
                isActive: true,
                userId: req.user.id // SCOPED
            }
        });

        if (carrierAccounts.length === 0) {
            return res.status(400).json({ error: 'No active carrier accounts found. Please contact admin.' });
        }

        // Cache Key Generation
        // We hash critical rate-affecting fields to ensure uniqueness
        const dataToHash = JSON.stringify({
            origin: shipment.originCountry,
            dest: shipment.destinationCountry,
            weight: shipment.totalWeightKg,
            items: shipment.lineItems.map(i => i.id).sort(), // Simplified item dependency
            carriers: carrierAccounts.map(c => c.id).sort()
        });
        const hash = crypto.createHash('md5').update(dataToHash).digest('hex');
        const cacheKey = `rates:${id}:${hash}`;

        // 1. Check Cache
        const cachedRates = await redis.get(cacheKey);
        if (cachedRates) {
            logger.info('Cache HIT for rates', { cacheKey });
            return res.json(JSON.parse(cachedRates));
        }

        logger.info('Cache MISS for rates', { cacheKey });

        const ratesPromises = carrierAccounts.map(async (account) => {
            try {
                const gateway = await CarrierFactory.getGateway(account.id);
                const rates = await gateway.getRates(shipment, shipment.lineItems);
                // Tag rates with the account ID so we know which one to book with
                return rates.map(r => ({ ...r, carrierAccountId: account.id }));
            } catch (err) {
                logger.error('Failed to get rates from account', { accountId: account.id, error: err.message });
                return [];
            }
        });

        const nestedRates = await Promise.all(ratesPromises);
        const allRates = nestedRates.flat();

        // 2. Store in Cache (TTL: 10 minutes)
        if (allRates.length > 0) {
            await redis.setex(cacheKey, 600, JSON.stringify(allRates));
        }

        // Update meta
        await prisma.shipmentCarrierMeta.upsert({
            where: { shipmentId: id },
            update: { rateQuoteJson: JSON.stringify(allRates) },
            create: { shipmentId: id, rateQuoteJson: JSON.stringify(allRates) }
        });

        res.json(allRates);
    } catch (error) {
        logger.error('Rate shop error', { error: error.message, stack: error.stack, shipmentId: req.params.id });
        res.status(500).json({ error: 'Failed to retrieve rates' });
    }
});

/**
 * POST /api/shipments/:id/book
 * Book a specific rate.
 */
router.post('/:id/book', async (req, res) => {
    try {
        const { id } = req.params;
        const { carrierAccountId, serviceCode, rateId } = req.body;

        if (!carrierAccountId || !serviceCode) {
            return res.status(400).json({ error: 'Missing carrierAccountId or serviceCode' });
        }

        // Verify Carrier Account Ownership
        const account = await prisma.carrierAccount.findUnique({
            where: { id: carrierAccountId }
        });

        if (!account || account.userId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied to carrier account' });
        }

        const gateway = await CarrierFactory.getGateway(carrierAccountId);

        // 1. Book with Carrier
        const bookingResult = await gateway.bookShipment({
            shipmentId: id,
            serviceCode,
            rateId // unique ID from quote if available
        });

        // 2. Generate Label Document (if we got raw data or need to generate one)
        // For Mock, we assume we generate a generic "Label" PDF using our doc engine or store what we got.
        // If bookingResult.labelData is null (Mock), let's generate a placeholder directly here or call generator.

        // A real implementation would save the buffer to disk/S3.
        // Here, we'll create a dummy document record.
        const labelFilename = `LABEL-${bookingResult.trackingNumber}.pdf`;

        // Save metadata
        const meta = await prisma.shipmentCarrierMeta.upsert({
            where: { shipmentId: id },
            update: {
                carrierCode: 'MOCK', // simplified
                serviceLevelCode: serviceCode,
                trackingNumber: bookingResult.trackingNumber,
                bookedAt: new Date(),
                bookingResponseJson: JSON.stringify(bookingResult)
            },
            create: {
                shipmentId: id,
                carrierCode: 'MOCK',
                serviceLevelCode: serviceCode,
                trackingNumber: bookingResult.trackingNumber,
                bookedAt: new Date(),
                bookingResponseJson: JSON.stringify(bookingResult)
            }
        });

        // Update main shipment status
        await prisma.shipment.update({
            where: { id },
            data: {
                status: 'booked',
                trackingNumber: bookingResult.trackingNumber,
                carrierCode: 'MOCK',
                serviceLevelCode: serviceCode
            }
        });

        res.json({
            success: true,
            trackingNumber: bookingResult.trackingNumber,
            labelUrl: null // TODO: return document URL once created
        });

    } catch (error) {
        logger.error('Booking error', { error: error.message, stack: error.stack, shipmentId: req.params.id });
        res.status(500).json({ error: 'Failed to book shipment' });
    }
});

module.exports = router;
