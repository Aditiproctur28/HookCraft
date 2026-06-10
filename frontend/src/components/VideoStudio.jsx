import React, { useState, useRef, useEffect } from 'react';
import { Player } from '@remotion/player';
import { MasterVideo } from './MasterVideo';
import { API_BASE } from '../config';

// Ordered pipeline stages for the stepper + their button labels.
const STAGES = [
    { key: 'script', label: 'Script', icon: '✍️' },
    { key: 'artwork', label: 'Artwork', icon: '🎨' },
    { key: 'voiceover', label: 'Voiceover', icon: '🎙️' },
    { key: 'render', label: 'Render', icon: '🎬' },
];
const STAGE_LABEL = {
    queued: 'Starting…',
    script: 'Generating Script…',
    artwork: 'Creating AI Artwork…',
    voiceover: 'Generating Voiceover…',
    render: 'Rendering Final MP4…',
    done: 'Done!',
    error: 'Failed',
};

// Aspect-ratio presets: composition size + on-screen preview size.
const ASPECTS = {
    '9:16': { label: 'Vertical', sub: '9:16', icon: '📱', compW: 1080, compH: 1920, viewW: 288, viewH: 512 },
    '16:9': { label: 'Horizontal', sub: '16:9', icon: '🖥️', compW: 1920, compH: 1080, viewW: 512, viewH: 288 },
};

// Caption animation styles.
const CAPTION_STYLES = {
    word: { label: 'Word-by-Word', sub: 'Snappy pop-ins', icon: '✨' },
    sentence: { label: 'Full Sentence', sub: 'Whole line per scene', icon: '📝' },
};

// Reusable two-card segmented toggle.
function OptionGroup({ label, options, value, onChange, disabled }) {
    return (
        <div className="mt-5">
            <label className="mb-2 block text-sm font-semibold text-slate-300">{label}</label>
            <div className="grid grid-cols-2 gap-3">
                {options.map((opt) => {
                    const selected = value === opt.key;
                    return (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() => !disabled && onChange(opt.key)}
                            disabled={disabled}
                            className={[
                                'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                                selected
                                    ? 'border-brand-500 bg-brand-500/15 ring-2 ring-brand-500/30'
                                    : 'border-hairline bg-surface-2 hover:border-slate-600',
                            ].join(' ')}
                        >
                            <span className="text-2xl">{opt.icon}</span>
                            <span>
                                <span className="block text-sm font-semibold text-white">{opt.label}</span>
                                <span className="block text-xs text-slate-400">{opt.sub}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function VideoStudio() {
    const [topic, setTopic] = useState('');
    const [aspectRatio, setAspectRatio] = useState('9:16');
    const [captionStyle, setCaptionStyle] = useState('word');
    const [job, setJob] = useState(null);
    const esRef = useRef(null);

    const isRunning = job && (job.status === 'pending' || job.status === 'running');
    const isDone = job && job.status === 'done';
    const isError = job && job.status === 'error';

    useEffect(() => () => esRef.current?.close(), []);

    const handleGenerate = async () => {
        if (!topic.trim() || isRunning) return;
        setJob({ status: 'pending', stage: 'queued', message: 'Starting…', pct: 0 });
        esRef.current?.close();

        try {
            const res = await fetch(`${API_BASE}/api/video/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, aspectRatio, captionStyle }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start the pipeline.');

            const es = new EventSource(`${API_BASE}/api/video/progress/${data.jobId}`);
            esRef.current = es;
            es.onmessage = (event) => {
                const update = JSON.parse(event.data);
                setJob(update);
                if (update.status === 'done' || update.status === 'error') es.close();
            };
            es.onerror = () => {
                es.close();
                setJob((prev) => prev?.status === 'done'
                    ? prev
                    : { ...(prev || {}), status: 'error', stage: 'error', message: 'Connection to the server was lost.' });
            };
        } catch (err) {
            setJob({ status: 'error', stage: 'error', message: err.message });
        }
    };

    const currentStageIndex = job ? STAGES.findIndex((s) => s.key === job.stage) : -1;
    // Preview frame matches the rendered video's orientation when known.
    const previewAspect = (job?.width && job?.height)
        ? ASPECTS[job.width >= job.height ? '16:9' : '9:16']
        : ASPECTS[aspectRatio];
    const buttonLabel = isRunning
        ? (STAGE_LABEL[job.stage] || job.message || 'Working…')
        : (isDone ? 'Generate Another' : 'Generate Video');

    return (
        <div className="rounded-3xl border border-hairline bg-surface/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            {/* Topic input */}
            <label className="mb-2 block text-sm font-semibold text-slate-300">Your idea</label>
            <textarea
                rows={4}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isRunning}
                placeholder="e.g., A single man explains why active listening wins trust — fast-paced vertical short…"
                className="w-full resize-y rounded-2xl border border-hairline bg-surface-2 p-4 text-[15px] text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
            />

            {/* Format + caption-style toggles */}
            <OptionGroup
                label="Format"
                value={aspectRatio}
                onChange={setAspectRatio}
                disabled={isRunning}
                options={Object.entries(ASPECTS).map(([key, a]) => ({ key, label: a.label, sub: a.sub, icon: a.icon }))}
            />
            <OptionGroup
                label="Captions"
                value={captionStyle}
                onChange={setCaptionStyle}
                disabled={isRunning}
                options={Object.entries(CAPTION_STYLES).map(([key, c]) => ({ key, ...c }))}
            />

            {/* Generate button */}
            <button
                onClick={handleGenerate}
                disabled={isRunning || !topic.trim()}
                className="group mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-violet-500 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-brand-600/30 transition hover:shadow-xl hover:shadow-brand-600/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
                {isRunning && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {!isRunning && <span>{isDone ? '🔁' : '🚀'}</span>}
                {buttonLabel}
            </button>

            {/* Stage stepper (visible once a run starts) */}
            {job && (
                <div className="mt-7 flex items-center justify-between gap-1">
                    {STAGES.map((stage, i) => {
                        const done = isDone || (currentStageIndex > i) || (job.stage === 'done');
                        const active = currentStageIndex === i && !isDone;
                        return (
                            <React.Fragment key={stage.key}>
                                <div className="flex flex-1 flex-col items-center gap-1.5">
                                    <div className={[
                                        'grid h-10 w-10 place-items-center rounded-full border text-base transition',
                                        done ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                            : active ? 'border-brand-500 bg-brand-500/20 text-white ring-4 ring-brand-500/20'
                                            : 'border-hairline bg-surface-2 text-slate-500',
                                    ].join(' ')}>
                                        {done ? '✓' : stage.icon}
                                    </div>
                                    <span className={[
                                        'text-[11px] font-medium',
                                        active ? 'text-white' : done ? 'text-emerald-300' : 'text-slate-500',
                                    ].join(' ')}>{stage.label}</span>
                                </div>
                                {i < STAGES.length - 1 && (
                                    <div className={`h-px flex-1 ${currentStageIndex > i || isDone ? 'bg-emerald-500/40' : 'bg-hairline'}`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {/* Progress bar + live message */}
            {job && !isDone && (
                <div className="mt-6">
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <div
                            className={`h-full rounded-full transition-[width] duration-500 ${isError ? 'bg-red-500' : 'bg-gradient-to-r from-brand-500 to-violet-500'}`}
                            style={{ width: `${job.pct || 0}%` }}
                        />
                    </div>
                    <p className={`mt-3 text-center text-sm font-medium ${isError ? 'text-red-400' : 'text-slate-400'}`}>
                        {isError ? `⚠️ ${job.message}` : job.message}
                    </p>
                </div>
            )}

            {/* Preview + download */}
            {isDone && job.scenes?.length > 0 && (
                <div className="mt-8 flex flex-col items-center rounded-2xl border border-hairline bg-canvas/60 p-6">
                    <h3 className="mb-5 flex items-center gap-2 text-lg font-bold text-white">
                        <span className="text-emerald-400">✅</span> Your video is ready
                    </h3>
                    <div className="overflow-hidden rounded-[20px] border-2 border-brand-500/60 shadow-2xl shadow-brand-600/20">
                        <Player
                            component={MasterVideo}
                            inputProps={{ scenes: job.scenes, width: previewAspect.compW, height: previewAspect.compH, captionStyle: job.captionStyle || captionStyle }}
                            durationInFrames={Math.max(job.totalDurationInFrames || 0, 150)}
                            fps={30}
                            compositionWidth={job.width || previewAspect.compW}
                            compositionHeight={job.height || previewAspect.compH}
                            style={{ width: `${previewAspect.viewW}px`, height: `${previewAspect.viewH}px` }}
                            controls
                            autoPlay
                        />
                    </div>
                    {job.downloadUrl && (
                        <a
                            href={job.downloadUrl}
                            download
                            className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
                        >
                            ⬇️ Download Final .MP4
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
