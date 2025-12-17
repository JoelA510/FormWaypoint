const express = require('express');
const router = express.Router();
const ShipmentService = require('../services/ShipmentService');

router.post('/', async (req, res) => {
    const result = await ShipmentService.createShipment(req.body);
    if (result.isSuccess) {
        res.status(201).json(result.getValue());
    } else {
        res.status(400).json({ error: result.getError() });
    }
});

router.get('/:id', async (req, res) => {
    const result = await ShipmentService.getShipment(req.params.id);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(404).json({ error: result.getError() });
    }
});

router.get('/', async (req, res) => {
    const result = await ShipmentService.listShipments(req.query);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(500).json({ error: result.getError() });
    }
});

module.exports = router;
