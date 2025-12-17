const express = require('express');
const router = express.Router();
const { prisma } = require('../queue');

// Get all templates for the authenticated user
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const templates = await prisma.documentTemplate.findMany({
            where: { userId },
            orderBy: [
                { isDefault: 'desc' },
                { updatedAt: 'desc' }
            ]
        });

        // Parse JSON header field
        const parsedTemplates = templates.map(t => ({
            ...t,
            header: t.header ? JSON.parse(t.header) : null
        }));

        res.json({ data: parsedTemplates });
    } catch (error) {
        console.error('Templates list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single template
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        const template = await prisma.documentTemplate.findFirst({
            where: {
                id: req.params.id,
                userId
            }
        });

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json({
            ...template,
            header: template.header ? JSON.parse(template.header) : null
        });
    } catch (error) {
        console.error('Template get error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create template
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { name, description, header, isDefault } = req.body;

        if (!name || !header) {
            return res.status(400).json({ error: 'Name and header are required' });
        }

        // If setting as default, unset other defaults
        if (isDefault) {
            await prisma.documentTemplate.updateMany({
                where: { userId, isDefault: true },
                data: { isDefault: false }
            });
        }

        const template = await prisma.documentTemplate.create({
            data: {
                name,
                description,
                userId,
                header: JSON.stringify(header),
                isDefault: isDefault || false
            }
        });

        res.status(201).json({
            ...template,
            header: JSON.parse(template.header)
        });
    } catch (error) {
        console.error('Template create error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update template
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        const { name, description, header, isDefault } = req.body;

        // Check ownership
        const existing = await prisma.documentTemplate.findFirst({
            where: { id: req.params.id, userId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // If setting as default, unset other defaults
        if (isDefault) {
            await prisma.documentTemplate.updateMany({
                where: { userId, isDefault: true, id: { not: req.params.id } },
                data: { isDefault: false }
            });
        }

        const template = await prisma.documentTemplate.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name }),
                ...(description !== undefined && { description }),
                ...(header && { header: JSON.stringify(header) }),
                ...(isDefault !== undefined && { isDefault })
            }
        });

        res.json({
            ...template,
            header: template.header ? JSON.parse(template.header) : null
        });
    } catch (error) {
        console.error('Template update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete template
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;

        // Check ownership
        const template = await prisma.documentTemplate.findFirst({
            where: { id: req.params.id, userId }
        });

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        await prisma.documentTemplate.delete({
            where: { id: req.params.id }
        });

        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        console.error('Template delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create document from template
router.post('/:id/apply', async (req, res) => {
    try {
        const userId = req.user?.id;

        const template = await prisma.documentTemplate.findFirst({
            where: { id: req.params.id, userId }
        });

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const header = JSON.parse(template.header);

        // Create new document with template data
        const document = await prisma.document.create({
            data: {
                filename: `From ${template.name}`,
                status: 'pending',
                header: template.header,
                lines: JSON.stringify([]),
                meta: JSON.stringify({ createdFromTemplate: template.id })
            }
        });

        res.status(201).json({
            ...document,
            header: JSON.parse(document.header),
            lines: []
        });
    } catch (error) {
        console.error('Apply template error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
