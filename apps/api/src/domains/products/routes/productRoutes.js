const express = require('express');
const router = express.Router();
const ProductService = require('../services/ProductService');

const handleRequest = require('../../../shared/utils/requestHandler');

router.post('/', (req, res) => handleRequest(res, ProductService.upsertProduct(req.body, req.user?.id), { successStatus: 200, errorStatus: 400 }));

router.get('/', (req, res) => handleRequest(res, ProductService.listProducts(req.query)));

router.get('/:sku', (req, res) => handleRequest(res, ProductService.resolveSku(req.params.sku), { errorStatus: 404 }));

module.exports = router;
