const express = require('express');
const router = express.Router();
const ComplianceService = require('../services/ComplianceService');
const { AssessAesSchema, SanctionsScreenSchema } = require('../dtos/complianceDto');

router.get('/dg/lookup/:unNumber', async (req, res) => {
    const result = await ComplianceService.lookupUnNumber(req.params.unNumber);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(404).json({ error: result.getError() });
    }
});

router.post('/aes/assess', async (req, res) => {
    try {
        const validated = AssessAesSchema.parse(req.body);
        const result = await ComplianceService.determineAesRequirement(validated);
        if (result.isSuccess) {
            res.json(result.getValue());
        } else {
            res.status(500).json({ error: result.getError() });
        }
    } catch (e) {
        res.status(400).json({ error: e.errors || e.message });
    }
});

router.post('/sanctions/screen', async (req, res) => {
    try {
        const validated = SanctionsScreenSchema.parse(req.body);
        const result = await ComplianceService.screenParties(validated.shipmentId);
        if (result.isSuccess) {
            res.json(result.getValue());
        } else {
            res.status(500).json({ error: result.getError() });
        }
    } catch (e) {
        res.status(400).json({ error: e.errors || e.message });
    }
});

module.exports = router;
