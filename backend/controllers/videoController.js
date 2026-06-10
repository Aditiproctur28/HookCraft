import { createJob, getJob, snapshot } from '../jobs/jobStore.js';
import { runPipeline } from '../jobs/pipeline.js';

/**
 * POST /api/video/generate
 * Starts the silent pipeline and immediately returns a job id.
 */
export const startVideo = (req, res) => {
    const { topic, aspectRatio } = req.body;
    if (!topic || !topic.trim()) {
        return res.status(400).json({ error: 'Please provide a topic.' });
    }

    const job = createJob();
    // Fire-and-forget; progress is observed via the SSE stream below.
    runPipeline(job, { topic, aspectRatio });

    return res.status(202).json({ jobId: job.id });
};

/**
 * GET /api/video/progress/:jobId
 * Server-Sent Events stream of pipeline progress for a job.
 */
export const streamProgress = (req, res) => {
    const { jobId } = req.params;
    const job = getJob(jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found.' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    if (res.flushHeaders) res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Replay current state immediately so a late subscriber isn't left blank.
    send(snapshot(job));
    if (job.status === 'done' || job.status === 'error') {
        return res.end();
    }

    const listener = (data) => {
        send(data);
        if (data.status === 'done' || data.status === 'error') {
            res.end();
        }
    };
    job.emitter.on('update', listener);

    req.on('close', () => {
        job.emitter.off('update', listener);
    });
};
