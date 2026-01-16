const express = require('express');
const { getJob, getDocument } = require('../queue');

const router = express.Router();

router.get('/jobs/:id', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
});

router.get('/documents/:id', (req, res) => {
    const doc = getDocument(req.params.id);
    if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json(doc);
});

module.exports = router;
