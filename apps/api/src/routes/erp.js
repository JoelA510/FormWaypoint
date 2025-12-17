const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const exportRunner = require('../services/erp/exportRunner');

// Middleware to mock user ID
const getUserId = (req) => req.user?.id || 'mock-user-id';

/**
 * GET /api/erp/configs
 * List export configurations.
 */
router.get('/configs', async (req, res) => {
    try {
        const userId = getUserId(req);
        const configs = await prisma.erpExportConfig.findMany({
            where: { userId },
            orderBy: { name: 'asc' }
        });
        res.json(configs);
    } catch (error) {
        console.error('Error listing ERP configs:', error);
        res.status(500).json({ error: 'Failed to list ERP configs' });
    }
});

/**
 * POST /api/erp/configs
 * Create a new export configuration.
 */
router.post('/configs', async (req, res) => {
    try {
        const userId = getUserId(req);
        const { name, targetType, format, destination, schedule } = req.body;

        const config = await prisma.erpExportConfig.create({
            data: {
                userId,
                name,
                targetType, // FILE, HTTP
                format,     // CSV, JSON
                destination,
                schedule
            }
        });
        res.status(201).json(config);
    } catch (error) {
        console.error('Error creating ERP config:', error);
        res.status(500).json({ error: 'Failed to create ERP config' });
    }
});

/**
 * GET /api/erp/jobs
 * List past export jobs.
 */
router.get('/jobs', async (req, res) => {
    try {
        const jobs = await prisma.erpExportJob.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { config: true }
        });
        res.json(jobs);
    } catch (error) {
        console.error('Error listing ERP jobs:', error);
        res.status(500).json({ error: 'Failed to list ERP jobs' });
    }
});

/**
 * POST /api/erp/jobs
 * Trigger an export job manually.
 */
router.post('/jobs', async (req, res) => {
    try {
        const { configId, fromDate, toDate } = req.body;

        if (!configId) return res.status(400).json({ error: 'configId is required' });

        // Create Job Record
        const job = await prisma.erpExportJob.create({
            data: {
                configId,
                status: 'PENDING',
                fromDate: new Date(fromDate || new Date().setHours(0, 0, 0, 0)),
                toDate: new Date(toDate || new Date()),
                runAt: new Date()
            }
        });

        // Trigger Async Run (No verify wait for response)
        exportRunner.runJob(job.id).catch(err => console.error('Async Job Failed:', err));

        res.status(201).json(job);
    } catch (error) {
        console.error('Error starting ERP job:', error);
        res.status(500).json({ error: 'Failed to start ERP job' });
    }
});

module.exports = router;
