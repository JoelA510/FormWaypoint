const express = require('express');
const router = express.Router();
const PartyService = require('../services/PartyService');

router.post('/', async (req, res) => {
    // Assuming req.user is populated by auth middleware
    const result = await PartyService.createParty(req.body, req.user?.id);
    if (result.isSuccess) {
        res.status(201).json(result.getValue());
    } else {
        res.status(400).json({ error: result.getError() });
    }
});

router.get('/address-book', async (req, res) => {
    const result = await PartyService.listAddressBook(req.user?.id, req.query);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(500).json({ error: result.getError() });
    }
});

router.get('/:id', async (req, res) => {
    const result = await PartyService.getParty(req.params.id);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(404).json({ error: result.getError() });
    }
});

module.exports = router;
