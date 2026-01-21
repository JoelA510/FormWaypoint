const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const { buildInvoiceViewModel, buildPackingListViewModel } = require('./viewModels');
const { PrismaClient } = require('@prisma/client');
const { getBrowser } = require('../browser');

const prisma = new PrismaClient(); // Or inject via DI

// Cache compiled templates
const templateCache = {};
const ALLOWED_TEMPLATE_HELPERS = new Set(['if', 'each', 'unless', 'eq']);

handlebars.registerHelper('eq', (a, b) => a === b);

function assertTemplateSafe(templateContent, templateName) {
    const ast = handlebars.parse(templateContent);
    const violations = [];

    const visit = (node) => {
        if (!node || typeof node !== 'object') return;

        if (node.type === 'PartialStatement' || node.type === 'PartialBlockStatement') {
            violations.push(`Partials are not allowed (found in ${templateName}).`);
        }

        if (node.type === 'MustacheStatement' || node.type === 'BlockStatement' || node.type === 'SubExpression') {
            if (node.type === 'MustacheStatement' && node.escaped === false) {
                violations.push(`Unescaped output is not allowed (found in ${templateName}).`);
            }

            if (node.params && node.params.length > 0) {
                const helperName = node.path?.original;
                if (helperName && !ALLOWED_TEMPLATE_HELPERS.has(helperName)) {
                    violations.push(`Helper "${helperName}" is not allowed in ${templateName}.`);
                }
            }
        }

        for (const key of Object.keys(node)) {
            if (key === 'loc') continue;
            const value = node[key];
            if (Array.isArray(value)) {
                value.forEach(visit);
            } else if (value && typeof value === 'object') {
                visit(value);
            }
        }
    };

    visit(ast);

    if (violations.length) {
        throw new Error(`Unsafe template content detected: ${violations.join(' ')}`);
    }
}

async function getTemplate(templateName) {
    if (templateCache[templateName]) return templateCache[templateName];

    const templatePath = path.join(__dirname, '../../templates', `${templateName}.hbs`);
    const templateContent = await fs.readFile(templatePath, 'utf8');
    assertTemplateSafe(templateContent, templateName);
    const compiled = handlebars.compile(templateContent, {
        strict: true,
        noEscape: false,
        knownHelpersOnly: true,
        knownHelpers: Object.fromEntries([...ALLOWED_TEMPLATE_HELPERS].map((helper) => [helper, true]))
    });
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
    const browser = await getBrowser();

    let page;
    try {
        page = await browser.newPage();
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
        if (page) {
            await page.close();
        }
    }
}

module.exports = {
    generateDocument
};
