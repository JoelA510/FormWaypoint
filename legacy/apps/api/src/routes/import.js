const express = require('express');
const multer = require('multer');
const { createJob } = require('../queue'); // Reuse queue if we want async, but Epic 2 asks for sync feedback? Plan said dedicated endpoint.
// Plan said: "POST /csv: Accepts file + optional mapping config. Validation: Checks for required fields. Persistence: Creates Shipment via Prisma."
// We will do direct processing for "Import v1" to give immediate feedback, as per plan notes.

const { parseCsv } = require('../services/import/csvParser');
const { mapRowsToUnknownShipment } = require('../services/import/mapper');
const { prisma } = require('../queue'); // Access prisma

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for CSV
});

// POST /import/csv
router.post('/csv', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // 1. Parse CSV
        const rows = await parseCsv(req.file.buffer);
        if (rows.length === 0) {
            return res.status(400).json({ error: 'CSV file is empty' });
        }

        // 2. Map to Shipment Structure
        const mappedData = mapRowsToUnknownShipment(rows);
        if (!mappedData) {
            return res.status(400).json({ error: 'Could not map CSV data' });
        }

        const { header, lines } = mappedData;
        const userId = req.user?.id || 'unknown'; // TODO: Auth middleware

        // 3. Persist to DB
        // We need to create a shipment + line items
        // We might need to find/create parties if we want to be fancy, but for now we just store the raw strings?
        // Wait, Shipment model expects `shipperId` etc or `shipperSnapshot`.
        // If we don't have IDs, we should probably just put the names in the snapshot?
        // Canonical Schema says `shipper: PartyRef`. Database has relations.
        // Phase 1 implementation plan said "Store mapping... Persist... Mark status = imported"
        // Let's create a "placeholder" party or just leave relations empty and put text in snapshot if possible?
        // The `Shipment` model has `shipperId` as optional? Let's check schema.
        // Actually, in Phase 1 we defined relations.
        // If we import from CSV, we likely don't have UUIDs.
        // Strategy: Create "Unlinked" shipment.
        // The Prisma schema might require relations. Let's check `schema.prisma` again later, but for now safely assume we might need dummy or handle it.
        // For MVP Import: We will create the shipment. If relations are optional, great. If not, we might fail.
        // Let's assume they are optional or we can skip them.

        // Actually, looking at previous schema.prisma view: `shipper Party? @relation...` -> Optional.
        // So we can save without shipperId.
        // But we should save the *name* somewhere. The `shipperSnapshot` is JSON, we can put it there!

        const shipmentData = {
            schemaVersion: 'shipment.v1',
            incoterm: header.incoterm,
            currency: header.currency,
            totalCustomsValue: header.totalCustomsValue,
            totalWeightKg: header.totalWeightKg,
            numPackages: header.numPackages,
            originCountry: header.originCountry,
            destinationCountry: header.destinationCountry,
            createdByUserId: userId,
            status: 'imported',

            // Store raw names in snapshots for now since we don't have IDs
            shipperSnapshot: JSON.stringify({ name: header.shipperName || 'Unknown Shipper (Imported)' }),
            consigneeSnapshot: JSON.stringify({ name: header.consigneeName || 'Unknown Consignee (Imported)' }),

            lineItems: {
                create: lines.map(line => ({
                    description: line.description,
                    quantity: line.quantity,
                    unitValue: line.unitValue,
                    extendedValue: line.extendedValue,
                    netWeightKg: line.netWeightKg,
                    htsCode: line.htsCode,
                    countryOfOrigin: line.countryOfOrigin
                    // uom? SKU?
                }))
            }
        };

        if (header.erpOrderId) shipmentData.erpOrderId = header.erpOrderId;

        const shipment = await prisma.shipment.create({
            data: shipmentData,
            include: { lineItems: true }
        });

        res.status(201).json({
            message: 'Import successful',
            shipmentId: shipment.id,
            totalLines: shipment.lineItems.length
        });

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: error.message });
    }
});

const { parseFile } = require('@formwaypoint/ingestion');
const { mapOcrToShipment } = require('../services/import/ocrMapper');

// POST /import/ocr
// Accepts PDF, Image (via conversion?), XLSX, CSV
router.post('/ocr', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const ext = req.file.originalname.split('.').pop().toLowerCase();
        let type = 'pdf'; // Default
        if (['xlsx', 'xls'].includes(ext)) type = 'xlsx';
        if (['csv'].includes(ext)) type = 'csv';
        if (['docx', 'doc'].includes(ext)) type = 'docx';
        // TODO: Image support if ingestion supports it or we convert

        // 1. Ingest/Parse
        const ocrResult = await parseFile(req.file.buffer, type);

        // 2. Map to Shipment
        const mappedData = mapOcrToShipment(ocrResult);

        const { header, lines } = mappedData;
        const userId = req.user?.id || 'unknown';

        // 3. Persist
        const shipmentData = {
            schemaVersion: 'shipment.v1',
            incoterm: header.incoterm,
            currency: header.currency,
            totalCustomsValue: header.totalCustomsValue,
            totalWeightKg: header.totalWeightKg,
            numPackages: header.numPackages,
            originCountry: header.originCountry,
            destinationCountry: header.destinationCountry,
            createdByUserId: userId,
            status: 'imported',
            erpOrderId: header.erpOrderId,

            shipperSnapshot: JSON.stringify({ name: header.shipperName }),
            consigneeSnapshot: JSON.stringify({ name: header.consigneeName }),

            lineItems: {
                create: lines.map(line => ({
                    description: line.description,
                    quantity: line.quantity,
                    extendedValue: line.extendedValue,
                    unitValue: line.unitValue,
                    netWeightKg: line.netWeightKg,
                    htsCode: line.htsCode,
                    countryOfOrigin: line.countryOfOrigin,
                    sku: line.sku
                }))
            }
        };

        const shipment = await prisma.shipment.create({
            data: shipmentData,
            include: { lineItems: true }
        });

        res.status(201).json({
            message: 'Import successful',
            shipmentId: shipment.id,
            totalLines: shipment.lineItems.length,
            confidence: 'high' // Mock confidence for now
        });

    } catch (error) {
        console.error('OCR Import error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
