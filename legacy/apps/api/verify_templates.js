const { generatePDF } = require('./src/services/generator');
const fs = require('fs');
const path = require('path');

// Mock data
const mockDoc = {
    id: 'DOC-12345',
    header: {
        shipper: 'Acme Corp',
        shipperAddress: '123 Industrial Way',
        shipperCityStateZip: 'Springfield, IL 62704',
        shipperContact: 'John Doe',
        shipperPhone: '555-0100',
        shipperRef: 'REF-001',
        consignee: 'Global Trade Inc',
        consigneeAddress: '456 Commerce Blvd',
        consigneeCityStateZip: 'Metropolis, NY 10012',
        consigneeContact: 'Jane Smith',
        consigneePhone: '555-0200',
        consigneeRef: 'LOC-999',
        consigneeCountry: 'USA',
        poNumber: 'PO-98765',
        billTo: 'Acme Corp HQ',
        serviceType: 'Priority',
        totalQty: 10,
        totalWeight: 500,
        totalWeightLbs: 1102,
        totalValue: 5000,
        specialInstructions: 'Handle with care. Do not stack.',
        isPallet: true
    },
    lines: [
        {
            quantity: 5,
            packageType: 'Carton',
            description: 'Widget Type A',
            netWeightKg: 50,
            weightLbs: 110,
            valueUsd: 500,
            htsCode: '8471.60.9050',
            nmfc: '123456',
            class: '70',
            hazardous: false
        },
        {
            quantity: 5,
            packageType: 'Carton',
            description: 'Widget Type B',
            netWeightKg: 50,
            weightLbs: 110,
            valueUsd: 500,
            htsCode: '8471.60.9050',
            nmfc: '123456',
            class: '70',
            hazardous: true
        }
    ]
};

async function verify() {
    const templates = ['fedex-bol', 'ups-bol', 'usps-label'];
    const outputDir = path.join(__dirname, 'output');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    for (const template of templates) {
        try {
            console.log(`Generating PDF for ${template}...`);
            const buffer = await generatePDF(mockDoc, template);
            const outputPath = path.join(outputDir, `verify-${template}.pdf`);
            fs.writeFileSync(outputPath, buffer);
            console.log(`Saved to ${outputPath}`);
        } catch (error) {
            console.error(`Failed to generate ${template}:`, error);
        }
    }
}

verify();
