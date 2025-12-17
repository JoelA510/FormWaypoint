const express = require('express');
const router = express.Router();
const ReportingService = require('../services/ReportingService');

router.get('/shipments-summary', async (req, res) => {
    const result = await ReportingService.getShipmentSummary(req.query);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(500).json({ error: result.getError() });
    }
});

module.exports = router;
