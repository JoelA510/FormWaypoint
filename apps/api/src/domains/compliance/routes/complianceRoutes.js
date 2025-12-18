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
    } catch (e) {
        res.status(400).json({ error: e.errors || e.message });
    }
});

router.post('/sanctions/ad-hoc', (req, res) => {
    // Basic body validation inline (or add to DTO later)
    const { name, country } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    return handleRequest(res, ComplianceService.screenAdHoc({ name, country }));
});

module.exports = router;
