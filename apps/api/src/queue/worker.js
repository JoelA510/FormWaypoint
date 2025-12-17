const { Worker } = require('bullmq');
const { connection } = require('./index');
const logger = require('../utils/logger');
const { generatePDF } = require('../services/generator');
const { saveFile } = require('../services/storage'); // You might need to adjust this depending on how upload logic is moved
// Note: secure zip uploading logic is currently inside the route. 
// Ideally we move the "processing" logic (parsing ZIP, saving entries) here.
// But for Step 1, let's assume we pass the file path or similar.

// Actually, looking at the route, it processes the buffer in memory. 
// For a true async queue, we should save the raw upload to a temp location FIRST, 
// then pass the path to the worker.
// However, yauzl works on buffers or files. 
// Let's implement the worker to handle "GENERATE_PDF" first as it's cleaner, 
// and "PROCESS_UPLOAD" might need more refactoring of the upload route to save-then-process.

const processor = async (job) => {
    switch (job.name) {
        case 'GENERATE_PDF':
            console.log(`[Worker] Processing PDF generation for job ${job.id}`);
            // job.data should contain { templateName, data }
            const result = await generatePDF(job.data.data, job.data.templateName);
            // We might want to save the result to storage/db instead of just returning buffer
            // For now, let's assuming generatePDF might need to change to save the file.
            // OR we return the path?
            // "generatePDF" currently returns a buffer.
            // We should save it.
            const fs = require('fs');
            const path = require('path');
            const outputPath = path.join(__dirname, '../../storage/outputs', `job-${job.id}.pdf`);

            // Ensure dir exists
            if (!fs.existsSync(path.dirname(outputPath))) {
                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            }

            fs.writeFileSync(outputPath, result);
            return { path: outputPath, filename: `job-${job.id}.pdf` };

        case 'GENERATE_LABEL':
            console.log(`[Worker] Generating Label for shipment ${job.data.shipmentId}`);
            try {
                const { shipmentId, carrierAccountId, serviceCode } = job.data;

                // Lazy load dependencies to avoid circular deps if any
                const prisma = require('../db');
                const CarrierFactory = require('../services/carriers/carrierFactory');
                const { saveFile } = require('../services/storage');

                const shipment = await prisma.shipment.findUnique({
                    where: { id: shipmentId },
                    include: {
                        shipper: true,
                        consignee: true
                    }
                });

                if (!shipment) throw new Error('Shipment not found');

                const adapter = await CarrierFactory.getAdapter(carrierAccountId);

                // Ensure service code is passed
                shipment.serviceLevelCode = serviceCode || shipment.serviceLevelCode;

                const labelResult = await adapter.createLabel(shipment);

                // Handle different result formats (buffer vs url)
                let labelBuffer;
                let mimeType = 'application/pdf'; // Default
                if (labelResult.labelBuffer) {
                    labelBuffer = labelResult.labelBuffer;
                } else if (labelResult.labelUrl) {
                    // Fetch URL (mock implementation for now)
                    // const fetch = require('node-fetch');
                    // const res = await fetch(labelResult.labelUrl);
                    // labelBuffer = await res.buffer();
                    labelBuffer = Buffer.from('Mock Label PDF Content');
                } else {
                    labelBuffer = Buffer.from('Mock Label Content');
                }

                // Save label file
                const savedFile = await saveFile(
                    labelBuffer,
                    `label-${shipment.trackingNumber || 'draft'}.pdf`,
                    mimeType
                );

                // Update DB
                await prisma.$transaction(async (tx) => {
                    // Update Shipment
                    await tx.shipment.update({
                        where: { id: shipmentId },
                        data: {
                            status: 'booked',
                            trackingNumber: labelResult.trackingNumber,
                            carrierAccountId: carrierAccountId,
                            serviceLevelCode: serviceCode
                        }
                    });

                    // Update/Create Meta
                    await tx.shipmentCarrierMeta.upsert({
                        where: { shipmentId: shipmentId },
                        create: {
                            shipmentId: shipmentId,
                            trackingNumber: labelResult.trackingNumber,
                            bookedAt: new Date(),
                            bookingResponseJson: JSON.stringify(labelResult)
                        },
                        update: {
                            trackingNumber: labelResult.trackingNumber,
                            bookedAt: new Date(),
                            bookingResponseJson: JSON.stringify(labelResult)
                        }
                    });

                    // Create Document Record
                    await tx.shipmentDocument.create({
                        data: {
                            shipmentId: shipmentId,
                            type: 'SHIPPING_LABEL',
                            format: 'pdf',
                            label: 'Shipping Label',
                            storageKey: savedFile.path, // or url depending on need
                        }
                    });
                });

                return { success: true, trackingNumber: labelResult.trackingNumber };

            } catch (error) {
                console.error('Label Generation Failed:', error);
                throw error;
            }

        case 'PROCESS_UPLOAD':
            // Placeholder for now as refactoring the ZIP stream logic is complex
            // and might require saving the temp file first.
            console.log(`[Worker] Processing Upload for job ${job.id}`);
            return { status: 'processed' };

        default:
            throw new Error(`Unknown job name: ${job.name}`);
    }
};

const worker = new Worker('shipping-doc-gen-queue', processor, {
    connection,
    concurrency: 5 // Process 5 jobs at a time
});

worker.on('completed', (job, returnvalue) => {
    logger.info('Job completed', { jobId: job.id, result: returnvalue });
});

worker.on('failed', (job, error) => {
    logger.error('Job failed', { jobId: job.id, error: error.message, stack: error.stack });
});

logger.info('Queue worker started');

module.exports = {
    worker
};
