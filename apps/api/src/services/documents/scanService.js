const logger = require('../../utils/logger');
const GhostscriptService = require('./ghostscriptService');
const AutoTagger = require('../classification/autoTagger');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ScanService {

    /**
     * Process an uploaded file: Sanitize -> OCR -> Tag -> Archive.
     * @param {string} filePath 
     * @param {string} userId 
     */
    async processUpload(filePath, userId) {
        logger.info(`Processing upload: ${filePath}`);

        // 1. Sanitize
        const cleanPath = await GhostscriptService.sanitize(filePath);

        // 2. OCR (Mock Sandwich)
        // Extract text and inject hidden layer
        const ocrResult = await this.performOcr(cleanPath);

        // 3. Create Document Record
        const document = await prisma.document.create({
            data: {
                filename: filePath.split('/').pop(),
                userId,
                status: 'processing',
                lines: JSON.stringify(ocrResult.lines),
                // meta: { pdfAPath: cleanPath }
            }
        });

        // 4. Auto-Tag
        const tags = await AutoTagger.classify(ocrResult.text);
        if (tags.length > 0) {
            await prisma.document.update({
                where: { id: document.id },
                data: {
                    tags: JSON.stringify(tags),
                    status: 'completed'
                }
            });
            logger.info(`Auto-tagged document ${document.id} with ${tags.join(', ')}`);
        } else {
            await prisma.document.update({
                where: { id: document.id },
                data: { status: 'pending_review' }
            });
        }

        return document;
    }

    async performOcr(filePath) {
        // Mock Tesseract/Textract
        return {
            text: "INVOICE #12345 Total: $500.00 Date: 2025-01-01 Vendor: UPS",
            lines: [
                { text: "INVOICE #12345", box: [10, 10, 100, 20] },
                { text: "Total: $500.00", box: [10, 30, 100, 40] },
                { text: "Date: 2025-01-01", box: [10, 50, 100, 60] }
            ]
        };
    }
}

module.exports = new ScanService();
