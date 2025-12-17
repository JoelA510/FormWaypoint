const express = require('express');
const router = express.Router();
const PartyService = require('../services/PartyService');

const handleRequest = require('../../../shared/utils/requestHandler');

router.post('/', (req, res) => handleRequest(res, PartyService.createParty(req.body, req.user?.id), { successStatus: 201, errorStatus: 400 }));

router.get('/address-book', (req, res) => handleRequest(res, PartyService.listAddressBook(req.user?.id, req.query)));

router.get('/:id', (req, res) => handleRequest(res, PartyService.getParty(req.params.id), { errorStatus: 404 }));

module.exports = router;
