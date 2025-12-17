const express = require('express');
const router = express.Router();
const ErpService = require('../services/ErpService');

const handleRequest = require('../../../shared/utils/requestHandler');

router.post('/configs', (req, res) => handleRequest(res, ErpService.createConfig(req.body, req.user?.id), { successStatus: 201, errorStatus: 400 }));

router.post('/jobs/:configId/trigger', (req, res) => handleRequest(res, ErpService.triggerExport(req.params.configId)));

module.exports = router;
