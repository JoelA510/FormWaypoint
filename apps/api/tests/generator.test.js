const { generatePDF } = require('../src/services/generator');
const fs = require('fs');
const path = require('path');

describe('PDF Generator', () => {
    const outputDir = path.join(__dirname, 'output');

    beforeAll(() => {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }
    });

    it('should generate a PDF from SLI template', async () => {
        const data = {
            id: 'TEST-DOC-001',
            header: {
                shipper: 'Test Shipper Inc.',
                consignee: 'Test Consignee Ltd.',
                incoterm: 'FOB',
                currency: 'USD'
            },
            lines: [
                {
                    partNumber: 'P123',
                    description: 'Widget A',
                    quantity: 100,
                    netWeightKg: 50,
                    valueUsd: 1000,
                    htsCode: '1234.56.78',
                    countryOfOrigin: 'US'
                }
            ]
        };

        const pdfBuffer = await generatePDF(data, 'sli');
        expect(pdfBuffer).toBeInstanceOf(Uint8Array);
        expect(pdfBuffer.length).toBeGreaterThan(0);

        // Optional: Write to file for manual inspection
        fs.writeFileSync(path.join(outputDir, 'test-sli.pdf'), pdfBuffer);
    }, 10000); // Increase timeout for Puppeteer launch
});
