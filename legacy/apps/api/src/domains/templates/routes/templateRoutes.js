const express = require('express');
const router = express.Router();
const TemplateService = require('../services/TemplateService');

const handleRequest = require('../../../shared/utils/requestHandler');

router.post('/', (req, res) => handleRequest(res, TemplateService.createTemplate(req.body, req.user?.id), { successStatus: 201, errorStatus: 400 }));

router.get('/', (req, res) => handleRequest(res, TemplateService.listTemplates(req.user?.id)));

router.get('/:id', (req, res) => handleRequest(res, TemplateService.getTemplate(req.params.id), { errorStatus: 404 }));

module.exports = router;
