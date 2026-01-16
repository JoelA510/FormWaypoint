const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { buildInvoiceViewModel, buildPackingListViewModel } = require('./viewModels');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient(); // Or inject via DI

// Cache compiled templates
const templateCache = {};

async function getTemplate(templateName) {
    if (templateCache[templateName]) return templateCache[templateName];

    const templatePath = path.join(__dirname, '../../templates', `${templateName}.hbs`);
    const templateContent = await fs.readFile(templatePath, 'utf8');
    const compiled = handlebars.compile(templateContent);
    templateCache[templateName] = compiled;
    return compiled;
}

/**
 * Generates a PDF document for a shipment.
 * @param {string} shipmentId 
 * @param {('commercial-invoice'|'packing-list')} type 
 * @param {Object} [options] 
 * @returns {Promise<{ filePath: string, documentId: string, filename: string }>}
 */
async function generateDocument(shipmentId, type, options = {}) {
    // 1. Fetch Data
    const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
        include: { lineItems: true }
    });

    if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

    // 2. Prepare View Model and Select Template
    let viewModel;
    let templateName;
    let filenamePrefix;

    switch (type) {
        case 'commercial-invoice':
            viewModel = buildInvoiceViewModel(shipment, shipment.lineItems);
            templateName = 'invoice';
            filenamePrefix = 'INV';
            break;
        case 'packing-list':
            viewModel = buildPackingListViewModel(shipment, shipment.lineItems);
            templateName = 'packingList';
            filenamePrefix = 'PL';
            break;
        default:
            throw new Error(`Unknown document type: ${type}`);
    }

    // 3. Render HTML
    const template = await getTemplate(templateName);
    const html = template(viewModel);

    // 4. Generate PDF via Puppeteer
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // Docker/Serverless friendly
        headless: 'new'
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // Define storage path
        const { validateEnv } = require('../../config/env');
        const config = validateEnv();
        const outputDir = config.storagePath;
        // ensure outputDir exists
        await fs.mkdir(outputDir, { recursive: true });

        const filename = `${filenamePrefix}-${shipment.erpOrderId || 'SHIP'}-${Date.now()}.pdf`;
        const filePath = path.join(outputDir, filename);

        await page.pdf({
            path: filePath,
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });

        const document = await prisma.document.create({
            data: {
                shipmentId,
                filename,
                type: 'application/pdf', // Mimetype
                status: 'completed',
                storageKey: filePath, // Using local path as key for now
                meta: JSON.stringify({ label: viewModel.metadata.title, type })
            }
        });

        const historian = require('../../services/history/historian');
        const userId = options.userId || 'system';
        await historian.logDocumentEvent(document.id, 'generated', userId, { type, filename });
        await historian.logShipmentEvent(shipmentId, 'document_generated', userId, { documentId: document.id, type });

        return {
            documentId: document.id,
            filePath,
            filename,
            url: `/files/${document.id}` // Virtual URL handled by routes/files.js
        };

    } finally {
        await browser.close();
    }
}

module.exports = {
    generateDocument
};
