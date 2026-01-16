const express = require('express');
const router = express.Router();
const authService = require('../services/auth');
const { prisma } = require('../queue');
const { requireAuth } = require('../middleware/auth');

router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        const result = await authService.register(username, password);
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await authService.login(username, password);
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

router.post('/logout', requireAuth, async (req, res) => {
    try {
        const { jti, exp } = req.user;
        if (jti && exp) {
            await authService.revokeToken(jti, exp);
        }
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/me', requireAuth, async (req, res) => {
    try {
        // req.user is populated by requireAuth middleware
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, username: true, email: true, role: true }
        });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
