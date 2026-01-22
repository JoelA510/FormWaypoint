
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { PrismaClient } from '@repo/schema';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

// Simple Template Registry
const TEMPLATES = {
    'commercial-invoice': `
        <html>
            <body>
                <h1>Commercial Invoice</h1>
                <p>Shipment ID: {{shipment.id}}</p>
                <h2>Shipper</h2>
                <p>{{shipment.shipperSnapshot.name}}</p>
                <h2>Consignee</h2>
                <p>{{shipment.consigneeSnapshot.name}}</p>
                <table>
                    <thead><tr><th>Item</th><th>Value</th></tr></thead>
                    <tbody>
                        {{#each items}}
                        <tr><td>{{description}}</td><td>{{unitValue}}</td></tr>
                        {{/each}}
                    </tbody>
                </table>
            </body>
        </html>
    `,
    'packing-list': `
        <html>
            <body>
                <h1>Packing List</h1>
                <p>Order: {{shipment.erpOrderId}}</p>
                <ul>
                    {{#each items}}
                    <li>{{quantity}} x {{description}}</li>
                    {{/each}}
                </ul>
            </body>
        </html>
    `
};

export class DocumentGenerator {

    static async generate(shipmentId: string, type: 'commercial-invoice' | 'packing-list') {
        // 1. Fetch Data
        const shipment = await prisma.shipment.findUniqueOrThrow({
            where: { id: shipmentId },
            include: { lineItems: true }
        });

        // 2. Prepare Context
        const context = {
            shipment,
            items: shipment.lineItems,
            date: new Date().toISOString()
        };

        // 3. Compile Template
        const templateSource = TEMPLATES[type];
        if (!templateSource) throw new Error(`Template ${type} not found`);

        const compile = Handlebars.compile(templateSource);
        const html = compile(context);

        // 4. Render PDF
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(html);

        // Mock storage path
        const filename = `${type}-${shipmentId}-${Date.now()}.pdf`;
        // In real app, write to S3/Disk. We'll return Buffer or Mock Key
        const pdfBuffer = await page.pdf({ format: 'A4' });

        await browser.close();

        // 5. Log Document
        const doc = await prisma.document.create({
            data: {
                shipmentId,
                filename,
                type: 'application/pdf',
                status: 'completed',
                storageKey: `local/${filename}`
            }
        });

        return {
            documentId: doc.id,
            filename,
            // buffer: pdfBuffer // Optional return if streaming
        };
    }
}
