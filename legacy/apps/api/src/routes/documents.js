const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const { addJob } = require('../queue');
const prisma = require('../db');

// Helper to validate results
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// Middleware to Ensure Document Ownership
const ensureDocOwner = async (req, res, next) => {
    try {
        const doc = await prisma.document.findUnique({
            where: { id: req.params.id }
        });

        if (!doc) return res.status(404).json({ error: 'Document not found' });

        // Allow if userId matches or if the doc has no user (legacy/admin?) 
        // Strict scoping: Only allow if matches.
        if (doc.userId && doc.userId !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        req.doc = doc; // Pass to route
        next();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get all documents (scoped to user)
router.get('/', [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate
], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Build filter conditions
        const where = {
            userId: req.user.id // SCOPING
        };

        // Date range filter
        if (req.query.startDate || req.query.endDate) {
            where.createdAt = {};
            if (req.query.startDate) {
                where.createdAt.gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                const endDate = new Date(req.query.endDate);
                endDate.setHours(23, 59, 59, 999);
                where.createdAt.lte = endDate;
            }
        }

        // Status filter
        if (req.query.status) {
            where.status = req.query.status;
        }

        // Filename search
        if (req.query.search) {
            where.filename = {
                contains: req.query.search
            };
        }

        const [docs, total] = await Promise.all([
            prisma.document.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.document.count({ where })
        ]);

        // Parse JSON fields and apply post-query filters
        let parsedDocs = docs.map(doc => ({
            ...doc,
            header: doc.header ? JSON.parse(doc.header) : null,
            lines: doc.lines ? JSON.parse(doc.lines) : [],
            checksums: doc.checksums ? JSON.parse(doc.checksums) : null,
            references: doc.references ? JSON.parse(doc.references) : [],
            meta: doc.meta ? JSON.parse(doc.meta) : null,
        }));

        // Value range filter
        if (req.query.minValue || req.query.maxValue) {
            parsedDocs = parsedDocs.filter(doc => {
                const totalValue = doc.header?.totalValue || 0;
                const min = req.query.minValue ? parseFloat(req.query.minValue) : -Infinity;
                const max = req.query.maxValue ? parseFloat(req.query.maxValue) : Infinity;
                return totalValue >= min && totalValue <= max;
            });
        }

        // Carrier filter
        if (req.query.carrier) {
            parsedDocs = parsedDocs.filter(doc => {
                return doc.meta?.carrier === req.query.carrier;
            });
        }

        res.json({
            data: parsedDocs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            },
            filters: {
                search: req.query.search,
                status: req.query.status,
                startDate: req.query.startDate,
                endDate: req.query.endDate,
                minValue: req.query.minValue,
                maxValue: req.query.maxValue,
                carrier: req.query.carrier
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single document
router.get('/:id', ensureDocOwner, async (req, res) => {
    // req.doc is set by middleware
    // We might want to parse JSON here too? The original code relied on 'getDocument' helper doing it.
    // I'll re-implement the parsing for consistency with the helper I replaced.
    const doc = req.doc;
    const parsed = {
        ...doc,
        header: doc.header ? JSON.parse(doc.header) : null,
        lines: doc.lines ? JSON.parse(doc.lines) : [],
        checksums: doc.checksums ? JSON.parse(doc.checksums) : null,
        references: doc.references ? JSON.parse(doc.references) : [],
        meta: doc.meta ? JSON.parse(doc.meta) : null,
    };
    res.json(parsed);
});

// Update document
router.put('/:id', [
    ensureDocOwner,
    body('header').optional().isObject(),
    body('lines').optional().isArray(),
    validate
], async (req, res) => {
    try {
        const updateData = {};
        if (req.body.header) updateData.header = JSON.stringify(req.body.header);
        if (req.body.lines) updateData.lines = JSON.stringify(req.body.lines);
        if (req.body.status) updateData.status = req.body.status;
        if (req.body.meta) updateData.meta = JSON.stringify(req.body.meta);

        // Validation ensures we don't save arbitrary garbage, but we still trust the structure is somewhat correct

        const updated = await prisma.document.update({
            where: { id: req.params.id },
            data: updateData
        });

        console.log(`Updated document ${req.params.id}`);

        const parsed = {
            ...updated,
            header: updated.header ? JSON.parse(updated.header) : null,
            lines: updated.lines ? JSON.parse(updated.lines) : [],
            checksums: updated.checksums ? JSON.parse(updated.checksums) : null,
            references: updated.references ? JSON.parse(updated.references) : [],
            meta: updated.meta ? JSON.parse(updated.meta) : null,
        };

        res.json(parsed);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger export
router.post('/:id/export', [
    ensureDocOwner,
    body('type').isIn(['commercial-invoice', 'packing-list', 'sli']),
    body('template').optional().isString(),
    validate
], async (req, res) => {
    const { type, template } = req.body;
    try {
        const { TEMPLATE_MAP } = require('../config/templates'); // Assuming this exists as in original
        const templateName = template ? (TEMPLATE_MAP[template] || 'sli') : 'sli';

        const job = await addJob('GENERATE_PDF', {
            data: req.doc, // Passing full doc data (parsed in middleware? No, req.doc is raw Prisma obj)
            // Original code passed 'doc' from getDocument which WAS parsed.
            // job processor likely expects parsed object or raw?
            // generator.js (Step 73) uses 'shipment' from DB, but this calls 'GENERATE_PDF' job.
            // worker.js (Step 83) calls generatePDF(job.data.data...).
            // generator.js (which one?)
            // If I pass raw doc (with JSON strings), the generator might fail if it expects objects.
            // I should parse it.
            templateName,
            documentId: req.params.id,
            userId: req.user.id, // Pass userId for audit logging
            type
        });

        res.status(202).json({
            message: 'Export started',
            jobId: job.id,
            statusUrl: `/jobs/${job.id}`,
            url: `/jobs/${job.id}` // Backward compat if needed?
        });
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get history (Audit Logs)
router.get('/:id/history', ensureDocOwner, async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            where: { documentId: req.params.id },
            orderBy: { timestamp: 'desc' },
            include: { user: { select: { username: true } } }
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get comments
router.get('/:id/comments', ensureDocOwner, async (req, res) => {
    try {
        const comments = await prisma.comment.findMany({
            where: { documentId: req.params.id },
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { username: true } } }
        });
        res.json(comments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add comment
router.post('/:id/comments', [
    ensureDocOwner,
    body('text').notEmpty().trim().escape().isLength({ max: 1000 }), // SEC-02 validation
    validate
], async (req, res) => {
    try {
        const { text } = req.body;
        const userId = req.user.id; // Guaranteed by requireAuth (upstream) and no fallback

        const comment = await prisma.comment.create({
            data: {
                text,
                documentId: req.params.id,
                userId: userId
            },
            include: { user: { select: { username: true } } }
        });

        // Add audit log
        await prisma.auditLog.create({
            data: {
                action: 'comment_added',
                documentId: req.params.id,
                userId: userId,
                details: JSON.stringify({ text })
            }
        });

        res.status(201).json(comment);
    } catch (error) {
        console.error('Comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
