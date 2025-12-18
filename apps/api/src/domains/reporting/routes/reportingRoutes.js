const express = require('express');
const router = express.Router();
const ReportingService = require('../services/ReportingService');
const carrierPerformanceService = require('../../../services/analytics/carrierPerformanceService');

router.get('/shipments-summary', async (req, res) => {
    const result = await ReportingService.getShipmentSummary(req.query);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(500).json({ error: result.getError() });
    }
});

router.get('/carrier-scorecards', async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        // Default to last 30 days if not provided
        const end = toDate ? new Date(toDate) : new Date();
        const start = fromDate ? new Date(fromDate) : new Date(new Date().setDate(end.getDate() - 30));

        const data = await carrierPerformanceService.getScorecard(start.toISOString(), end.toISOString());
        res.json(data);
    } catch (error) {
        console.error('Error fetching carrier scorecards:', error);
        res.status(500).json({ error: 'Failed to fetch carrier scorecards' });
    }
});

module.exports = router;
