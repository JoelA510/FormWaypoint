const express = require('express');
const router = express.Router();
const ErpService = require('../services/ErpService');

router.post('/configs', async (req, res) => {
    const result = await ErpService.createConfig(req.body, req.user?.id);
    if (result.isSuccess) {
        res.status(201).json(result.getValue());
    } else {
        res.status(400).json({ error: result.getError() });
    }
});

router.post('/jobs/:configId/trigger', async (req, res) => {
    const result = await ErpService.triggerExport(req.params.configId);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(500).json({ error: result.getError() });
    }
});

module.exports = router;
