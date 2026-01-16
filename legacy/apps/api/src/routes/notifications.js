const express = require('express');
const router = express.Router();
const { prisma } = require('../queue');
const { sendEmail } = require('../services/email');

// Get notifications for current user
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50, // Limit to recent 50
            include: {
                document: {
                    select: { id: true, filename: true }
                }
            }
        });

        res.json({ data: notifications });
    } catch (error) {
        console.error('Notifications list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mark notification as read
router.put('/:id/read', async (req, res) => {
    try {
        const userId = req.user?.id;

        const notification = await prisma.notification.findFirst({
            where: { id: req.params.id, userId }
        });

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        const updated = await prisma.notification.update({
            where: { id: req.params.id },
            data: { read: true }
        });

        res.json(updated);
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user notification settings
router.get('/settings', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                email: true,
                notifyOnComment: true,
                notifyOnMention: true,
                notifyOnAssignment: true,
                notifyOnCompletion: true
            }
        });

        res.json(user);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user notification settings
router.put('/settings', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { email, notifyOnComment, notifyOnMention, notifyOnAssignment, notifyOnCompletion } = req.body;

        const updated = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(email !== undefined && { email }),
                ...(notifyOnComment !== undefined && { notifyOnComment }),
                ...(notifyOnMention !== undefined && { notifyOnMention }),
                ...(notifyOnAssignment !== undefined && { notifyOnAssignment }),
                ...(notifyOnCompletion !== undefined && { notifyOnCompletion })
            },
            select: {
                email: true,
                notifyOnComment: true,
                notifyOnMention: true,
                notifyOnAssignment: true,
                notifyOnCompletion: true
            }
        });

        res.json(updated);
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to create notification
async function createNotification(userId, type, documentId, message) {
    try {
        const notification = await prisma.notification.create({
            data: {
                userId,
                type,
                documentId,
                message
            }
        });

        // Check user preferences and send email if enabled
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                email: true,
                notifyOnComment: true,
                notifyOnMention: true,
                notifyOnAssignment: true,
                notifyOnCompletion: true
            }
        });

        let shouldSendEmail = false;
        if (type === 'comment' && user.notifyOnComment) shouldSendEmail = true;
        if (type === 'mention' && user.notifyOnMention) shouldSendEmail = true;
        if (type === 'assignment' && user.notifyOnAssignment) shouldSendEmail = true;
        if (type === 'completion' && user.notifyOnCompletion) shouldSendEmail = true;

        if (shouldSendEmail && user.email) {
            const document = await prisma.document.findUnique({
                where: { id: documentId }
            });

            const sent = await sendEmail(user.email, type, {
                userName: 'System', // In real app, get from req.user
                documentName: document?.filename || 'Unknown',
                documentUrl: `${process.env.APP_URL || 'http://localhost:3000'}/documents/${documentId}`,
                commentText: message
            });

            if (sent) {
                await prisma.notification.update({
                    where: { id: notification.id },
                    data: { sentEmail: true }
                });
            }
        }

        return notification;
    } catch (error) {
        console.error('Create notification error:', error);
        throw error;
    }
}

module.exports = router;
module.exports.createNotification = createNotification;
