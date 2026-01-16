const exportBuilder = require('./exportBuilder');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
// const axios = require('axios'); // Use fetch in Node 18+ or generic request

/**
 * Service to execute ERP export jobs.
 */
class ExportRunner {

    async runJob(jobId) {
        console.log(`[ExportRunner] Starting Job ${jobId}`);

        const job = await prisma.erpExportJob.findUnique({
            where: { id: jobId },
            include: { config: true }
        });

        if (!job) throw new Error(`Job ${jobId} not found`);

        try {
            // Update status to running
            await prisma.erpExportJob.update({
                where: { id: jobId },
                data: { status: 'RUNNING' }
            });

            // 1. Build Data
            const exports = await exportBuilder.buildShipmentExports(job.fromDate, job.toDate);
            console.log(`[ExportRunner] Found ${exports.length} records`);

            // 2. Format
            let content = '';
            let extension = '';

            if (job.config.format === 'CSV') {
                content = this.toCsv(exports);
                extension = 'csv';
            } else {
                content = JSON.stringify(exports, null, 2);
                extension = 'json';
            }

            // 3. Deliver
            let resultInfo = {};
            if (job.config.targetType === 'FILE') {
                resultInfo = await this.deliverToFile(job.config, content, extension);
            } else if (job.config.targetType === 'HTTP') {
                resultInfo = await this.deliverToHttp(job.config, content);
            }

            // 4. Success
            await prisma.erpExportJob.update({
                where: { id: jobId },
                data: {
                    status: 'SUCCESS',
                    resultSummaryJson: JSON.stringify({ count: exports.length, ...resultInfo })
                }
            });

        } catch (error) {
            console.error(`[ExportRunner] Job ${jobId} Failed`, error);
            await prisma.erpExportJob.update({
                where: { id: jobId },
                data: {
                    status: 'FAILED',
                    errorMessage: error.message
                }
            });
            throw error;
        }
    }

    toCsv(data) {
        if (!data || data.length === 0) return '';
        const header = Object.keys(data[0]).join(',');
        const rows = data.map(row =>
            Object.values(row).map(v =>
                typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v
            ).join(',')
        );
        return [header, ...rows].join('\n');
    }

    async deliverToFile(config, content, extension) {
        // Mock file delivery to a 'exports' folder
        const filename = `erp_export_${config.name.replace(/\s+/g, '_')}_${Date.now()}.${extension}`;
        const exportDir = path.join(__dirname, '../../../../exports'); // Adjust path as needed

        // Ensure dir exists
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }

        const filePath = path.join(exportDir, filename);
        fs.writeFileSync(filePath, content);

        return { type: 'FILE', path: filePath };
    }

    async deliverToHttp(config, content) {
        // Mock HTTP delivery
        console.log(`[ExportRunner] POST to ${config.destination} (Mocked)`);
        // In real app: await fetch(config.destination, { method: 'POST', body: content ... })
        return { type: 'HTTP', status: 200, mocked: true };
    }
}

module.exports = new ExportRunner();
