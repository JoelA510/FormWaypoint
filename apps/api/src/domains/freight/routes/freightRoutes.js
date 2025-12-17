const express = require('express');
const router = express.Router();
const FreightService = require('../services/FreightService');

const handleRequest = require('../../../shared/utils/requestHandler');

router.post('/profiles', (req, res) => handleRequest(res, FreightService.createProfile(req.body, req.user?.id), { successStatus: 201, errorStatus: 400 }));

router.post('/bundle/:shipmentId', (req, res) => {
    const { profileId } = req.body;
    return handleRequest(res, FreightService.generateForwarderBundle(req.params.shipmentId, profileId));
});

module.exports = router;
