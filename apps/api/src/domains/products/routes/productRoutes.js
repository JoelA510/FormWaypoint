const express = require('express');
const router = express.Router();
const ProductService = require('../services/ProductService');

router.post('/', async (req, res) => {
    const result = await ProductService.upsertProduct(req.body, req.user?.id);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(400).json({ error: result.getError() });
    }
});

router.get('/', async (req, res) => {
    const result = await ProductService.listProducts(req.query);
    if (result.isSuccess) {
        res.json(result.getValue());
    } else {
        res.status(500).json({ error: result.getError() });
    }
});

router.get('/:sku', async (req, res) => {
    const result = await ProductService.resolveSku(req.params.sku);
    if (result.isSuccess) {
        const item = result.getValue();
        if (!item) return res.status(404).json({ error: 'SKU not found' });
        res.json(item);
    } else {
        res.status(500).json({ error: result.getError() });
    }
});

module.exports = router;
