import { createJob, getJob, snapshot } from '../jobs/jobStore.js';
import { runPreparation, regenerateCharacter, runProduction } from '../jobs/pipeline.js';

/**
 * POST /api/video/generate
 * Starts preparation (script + character concept) and returns a job id.
 * The pipeline pauses at `awaiting_approval` for the character step.
 */
export const startVideo = (req, res) => {
    const { topic, aspectRatio, imageMode, captionStyle } = req.body;
    if (!topic || !topic.trim()) {
        return res.status(400).json({ error: 'Please provide a topic.' });
    }

    const job = createJob();
    runPreparation(job, { topic, aspectRatio, imageMode, captionStyle });

    return res.status(202).json({ jobId: job.id });
};

/**
 * POST /api/video/:jobId/regenerate-character
 * Regenerates the character concept with a fresh seed. Progress/result flow
 * over the open SSE stream.
 */
export const regenerateCharacterHandler = (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.status !== 'awaiting_approval') {
        return res.status(409).json({ error: 'Character can only be regenerated while awaiting approval.' });
    }
    regenerateCharacter(job);
    return res.status(202).json({ ok: true });
};

/**
 * POST /api/video/:jobId/approve
 * Approves the character and resumes the production phase.
 */
export const approveHandler = (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.status !== 'awaiting_approval') {
        return res.status(409).json({ error: 'Job is not awaiting approval.' });
    }
    runProduction(job);
    return res.status(202).json({ ok: true });
};

/**
 * GET /api/video/progress/:jobId
 * Server-Sent Events stream of job progress (stays open through the
 * approval pause; closes on done/error).
 */
export const streamProgress = (req, res) => {
    const { jobId } = req.params;
    const job = getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    if (res.flushHeaders) res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    send(snapshot(job));
    if (job.status === 'done' || job.status === 'error') {
        return res.end();
    }

    // Heartbeat keeps the stream alive through the (possibly long) approval pause.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

    const listener = (data) => {
        send(data);
        if (data.status === 'done' || data.status === 'error') {
            clearInterval(heartbeat);
            res.end();
        }
    };
    job.emitter.on('update', listener);
    req.on('close', () => {
        clearInterval(heartbeat);
        job.emitter.off('update', listener);
    });
};
