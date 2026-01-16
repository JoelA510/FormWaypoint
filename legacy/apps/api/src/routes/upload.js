const express = require('express');
const multer = require('multer');
const { addJob } = require('../queue');
const { saveFile } = require('../services/storage');
const { validateFileSignature } = require('../utils/fileValidation');

const router = express.Router();
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

const checkZip = (filePath) => {
    try {
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();

        let totalSize = 0;
        const MAX_TOTAL_SIZE = 300 * 1024 * 1024; // 300MB extracted limit
        const MAX_ENTRIES = 100;

        if (entries.length > MAX_ENTRIES) {
            throw new Error(`Too many files in ZIP (max ${MAX_ENTRIES})`);
        }

        for (const entry of entries) {
            // Check compression ratio risk?
            // AdmZip entry.header.size is compressed, entry.header.originalSize is uncompressed? No.
            // entry.header.compressedSize / size
            totalSize += entry.header.size; // uncompressed size

            if (totalSize > MAX_TOTAL_SIZE) {
                throw new Error('ZIP contents exceed size limit');
            }

            if (entry.entryName.includes('..')) {
                throw new Error('Malicious zip entry (Zip Slip)');
            }
        }
        return true;
    } catch (err) {
        throw new Error(`Invalid ZIP: ${err.message}`);
    }
};

router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const tempPath = req.file.path;

    try {
        // 1. Validate File Signature
        // We read the file into buffer for validation AND saving (since saveFile needs buffer for now)
        // Ideally we'd stream, but this fixes the immediate DoS of holding ALL uploads in RAM during network transfer.
        const buffer = await fs.promises.readFile(tempPath);

        await validateFileSignature(buffer, req.file.mimetype);

        const isZip = req.file.mimetype === 'application/zip' ||
            req.file.mimetype === 'application/x-zip-compressed' ||
            req.file.originalname.toLowerCase().endsWith('.zip');

        if (isZip) {
            checkZip(tempPath);
        }

        // 2. Save file
        // Pass mimetype to saveFile for S3 security
        const savedFile = await saveFile(buffer, req.file.originalname, req.file.mimetype);

        // 3. Enqueue Job
        const jobName = isZip ? 'PROCESS_UPLOAD' : 'PROCESS_SINGLE_FILE';
        const job = await addJob(jobName, {
            filePath: savedFile.path,
            filename: savedFile.filename,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype
        });

        res.status(202).json({
            message: 'File upload accepted for processing',
            jobId: job.id,
            statusUrl: `/jobs/${job.id}`
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(400).json({ error: error.message });
    } finally {
        // Cleanup temp file
        try {
            if (fs.existsSync(tempPath)) {
                await fs.promises.unlink(tempPath);
            }
        } catch (cleanupError) {
            console.error('Failed to cleanup temp file:', cleanupError);
        }
    }
});

module.exports = router;
