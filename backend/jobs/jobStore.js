import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

// In-memory job registry. Single-process scope (matches the current deployment
// model); swap for Redis/DB if we ever go multi-process.
const jobs = new Map();

export function createJob() {
    const id = randomUUID();
    const job = {
        id,
        status: 'pending',        // pending | running | awaiting_approval | done | error
        stage: 'queued',          // queued | script | character | artwork | voiceover | render | done | error
        message: 'Queued…',
        pct: 0,
        scenes: null,             // populated once assets are ready
        totalDurationInFrames: 0,
        width: 1080,              // video dimensions (set from aspect ratio)
        height: 1920,
        captionStyle: 'word',     // 'word' | 'sentence'
        imageMode: 'dynamic',     // 'dynamic' (per-scene) | 'static' (one locked image)
        character: null,          // { imageUrl, seed } once the concept is generated
        regenerating: false,      // true while a new character render is in flight
        // Internal-only (not surfaced to the user): kept for the production phase.
        _topic: null,
        _aspectRatio: '9:16',
        _scriptData: null,
        downloadUrl: null,
        error: null,
        emitter: new EventEmitter(),
    };
    job.emitter.setMaxListeners(0); // allow many SSE subscribers without warnings
    jobs.set(id, job);
    return job;
}

export function getJob(id) {
    return jobs.get(id);
}

/** Public, serializable view of a job (drops the EventEmitter and _internal fields). */
export function snapshot(job) {
    const out = {};
    for (const [k, v] of Object.entries(job)) {
        if (k === 'emitter' || k.startsWith('_')) continue;
        out[k] = v;
    }
    return out;
}

/** Merge a patch into the job and notify all SSE subscribers. */
export function updateJob(id, patch) {
    const job = jobs.get(id);
    if (!job) return;
    Object.assign(job, patch);
    job.emitter.emit('update', snapshot(job));
    return job;
}
