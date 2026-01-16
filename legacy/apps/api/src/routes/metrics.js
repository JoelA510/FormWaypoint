const express = require('express');
const router = express.Router();
const { ingestionQueue } = require('../queue');

router.get('/', async (req, res) => {
    try {
        const counts = await ingestionQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

        // Format for Prometheus (basic text format)
        const metrics = [
            '# HELP ingestion_queue_jobs_total Number of jobs in the ingestion queue',
            '# TYPE ingestion_queue_jobs_total gauge',
            `ingestion_queue_jobs_total{status="waiting"} ${counts.waiting}`,
            `ingestion_queue_jobs_total{status="active"} ${counts.active}`,
            `ingestion_queue_jobs_total{status="completed"} ${counts.completed}`,
            `ingestion_queue_jobs_total{status="failed"} ${counts.failed}`,
            `ingestion_queue_jobs_total{status="delayed"} ${counts.delayed}`
        ].join('\n');

        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (error) {
        res.status(500).send(`# Error collecting metrics: ${error.message}`);
    }
});

module.exports = router;
