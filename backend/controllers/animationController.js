import { createJob } from '../jobs/jobStore.js';
import { runAnimation } from '../jobs/animationPipeline.js';

// Re-export the generic SSE progress handler so animation jobs stream the same way.
export { streamProgress } from './videoController.js';

/**
 * POST /api/animation/generate
 * Starts the full animation pipeline (script → stills → AI clips → render) and
 * returns a job id. There is no character-approval pause in animation mode.
 */
export const startAnimation = (req, res) => {
    const { topic, aspectRatio, captionStyle, scriptMode, language, narration } = req.body;
    if (!topic || !topic.trim()) {
        return res.status(400).json({ error: 'Please provide a topic.' });
    }

    const job = createJob();
    runAnimation(job, { topic, aspectRatio, captionStyle, scriptMode, language, narration });

    return res.status(202).json({ jobId: job.id });
};
