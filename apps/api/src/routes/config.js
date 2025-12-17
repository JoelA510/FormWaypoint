const express = require('express');
const router = express.Router();
const { getFeatureFlags } = require('../services/featureFlags');

// GET /api/config/features
router.get('/features', (req, res) => {
    res.json(getFeatureFlags());
});

module.exports = router;
