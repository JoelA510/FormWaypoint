const express = require('express');
const { getJob } = require('../queue');
const router = express.Router();

/**
 * GET /jobs/:id
 * Get the status and result of a job.
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const job = await getJob(id);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const state = await job.getState();
        const progress = job.progress;
        const result = job.returnvalue;
        const reason = job.failedReason;

        res.json({
            id: job.id,
            state,
            progress,
            result,
            error: reason,
            createdAt: job.timestamp,
            finishedAt: job.finishedOn
        });
    } catch (error) {
        console.error('Job fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch job status' });
    }
});

module.exports = router;
