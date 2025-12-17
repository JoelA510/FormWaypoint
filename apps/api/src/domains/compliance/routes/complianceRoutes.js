const express = require('express');
const router = express.Router();
const ComplianceService = require('../services/ComplianceService');
const { AssessAesSchema, SanctionsScreenSchema } = require('../dtos/complianceDto');

const handleRequest = require('../../../shared/utils/requestHandler');

router.get('/dg/lookup/:unNumber', (req, res) => handleRequest(res, ComplianceService.lookupUnNumber(req.params.unNumber), { errorStatus: 404 }));

router.post('/aes/assess', (req, res) => {
    try {
        const validated = AssessAesSchema.parse(req.body);
        return handleRequest(res, ComplianceService.determineAesRequirement(validated));
    } catch (e) {
        res.status(400).json({ error: e.errors || e.message });
    }
});

router.post('/sanctions/screen', (req, res) => {
    try {
        const validated = SanctionsScreenSchema.parse(req.body);
        return handleRequest(res, ComplianceService.screenParties(validated.shipmentId));
    } catch (e) {
        res.status(400).json({ error: e.errors || e.message });
    }
});

module.exports = router;
