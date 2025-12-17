const express = require('express');
const router = express.Router();
const FreightService = require('../services/FreightService');

router.post('/profiles', async (req, res) => {
    const result = await FreightService.createProfile(req.body, req.user?.id);
    if (result.isSuccess) {
        res.status(201).json(result.getValue());
    } else {
        res.status(400).json({ error: result.getError() });
    }
});

router.post('/bundle/:shipmentId', async (req, res) => {
    // profileId from body or query
    const { profileId } = req.body;
    const result = await FreightService.generateForwarderBundle(req.params.shipmentId, profileId);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(500).json({ error: result.getError() });
    }
});

module.exports = router;
