const express = require('express');
const router = express.Router();
const partyService = require('../services/parties/partyService');

// GET /parties (Address Book)
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const result = await partyService.listParties({
            search: req.query.search,
            limit,
            offset,
            userId: req.user.id // Pass user ID
        });

        res.json({
            data: result.data,
            pagination: {
                page,
                limit,
                total: result.total,
                pages: Math.ceil(result.total / limit)
            }
        });
    } catch (error) {
        console.error('List parties error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /parties
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        // Basic validation
        if (!req.body.name || !req.body.addressLine1 || !req.body.city || !req.body.countryCode) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const party = await partyService.createParty(req.body, userId);
        res.status(201).json(party);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /parties/:id
router.get('/:id', async (req, res) => {
    try {
        const party = await partyService.getParty(req.params.id, req.user.id);
        if (!party) return res.status(404).json({ error: 'Party not found' });
        res.json(party);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /parties/:id
router.put('/:id', async (req, res) => {
    try {
        const updated = await partyService.updateParty(req.params.id, req.body, req.user.id);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /parties/:id
router.delete('/:id', async (req, res) => {
    try {
        await partyService.deleteParty(req.params.id, req.user.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
