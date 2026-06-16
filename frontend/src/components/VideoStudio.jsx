import React, { useState, useRef, useEffect } from 'react';
import { Player } from '@remotion/player';
import { MasterVideo } from './MasterVideo';
import { API_BASE } from '../config';

const STAGES = [
    { key: 'script', label: 'Script', icon: '✍️' },
    { key: 'character', label: 'Character', icon: '🧑‍🎤' },
    { key: 'artwork', label: 'Artwork', icon: '🎨' },
    { key: 'voiceover', label: 'Voiceover', icon: '🎙️' },
    { key: 'render', label: 'Render', icon: '🎬' },
];
const STAGE_LABEL = {
    queued: 'Starting…',
    script: 'Generating Script…',
    character: 'Creating Character…',
    artwork: 'Creating AI Artwork…',
    voiceover: 'Generating Voiceover…',
    render: 'Rendering Final MP4…',
    done: 'Done!',
    error: 'Failed',
};

const ASPECTS = {
    '9:16': { label: 'Vertical', sub: '9:16', icon: '📱', compW: 1080, compH: 1920, viewW: 288, viewH: 512 },
    '16:9': { label: 'Horizontal', sub: '16:9', icon: '🖥️', compW: 1920, compH: 1080, viewW: 512, viewH: 288 },
};
const CAPTION_STYLES = {
    word: { label: 'Word-by-Word', sub: 'Snappy pop-ins', icon: '✨' },
    sentence: { label: 'Full Sentence', sub: 'Whole line per scene', icon: '📝' },
};
const IMAGE_MODES = {
    dynamic: { label: 'Dynamic', sub: 'Character · per scene', icon: '🎞️' },
    static: { label: 'Static', sub: 'Character · 1 image', icon: '🖼️' },
    narrator: { label: 'Narrator', sub: 'No character · B-roll', icon: '📜' },
};
const SCRIPT_MODES = {
    auto: { label: 'Auto-Generate', sub: 'AI writes the script', icon: '🤖' },
    verbatim: { label: 'Use My Words', sub: 'Speak my script exactly', icon: '📄' },
};
const LANGUAGES = {
    en: { label: 'English', sub: 'US neural voice', icon: '🇺🇸' },
    hi: { label: 'Hindi', sub: 'हिंदी आवाज़', icon: '🇮🇳' },
};

// Persisted so an in-progress (or finished) job survives a page reload.
const JOB_KEY = 'hookcraft.activeJobId';

// Reusable segmented toggle. cols=2 → horizontal cards; cols>=3 → compact centered cards.
function OptionGroup({ label, options, value, onChange, disabled, cols = 2 }) {
    const compact = cols >= 3;
    return (
        <div className="mt-5">
            <label className="mb-2 block text-sm font-semibold text-slate-300">{label}</label>
            <div className={`grid gap-3 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {options.map((opt) => {
                    const selected = value === opt.key;
                    return (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() => !disabled && onChange(opt.key)}
                            disabled={disabled}
                            className={[
                                'rounded-2xl border p-3.5 transition disabled:cursor-not-allowed disabled:opacity-60',
                                compact ? 'flex flex-col items-center gap-1 text-center' : 'flex items-center gap-3 text-left',
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
    const [imageMode, setImageMode] = useState('dynamic');
    const [scriptMode, setScriptMode] = useState('auto');
    const [language, setLanguage] = useState('en');
    const [job, setJob] = useState(null);
    const esRef = useRef(null);

    const status = job?.status;
    const isAwaiting = status === 'awaiting_approval';
    const isRunning = status === 'pending' || status === 'running';
    const isDone = status === 'done';
    const isError = status === 'error';
    const isBusy = isRunning || isAwaiting;

    // Subscribe to a job's progress stream. `isRestore` distinguishes a reload
    // reconnect (where a vanished job means "start fresh") from a live run.
    const subscribe = (jobId, { isRestore = false } = {}) => {
        esRef.current?.close();
        const es = new EventSource(`${API_BASE}/api/video/progress/${jobId}`);
        esRef.current = es;
        let gotMessage = false;
        es.onmessage = (event) => {
            gotMessage = true;
            const update = JSON.parse(event.data);
            setJob(update);
            if (update.status === 'done' || update.status === 'error') es.close();
        };
        es.onerror = () => {
            es.close();
            // On reload, a job the server no longer knows about (e.g. it restarted)
            // shouldn't show a scary error — just clear it and reset the form.
            if (isRestore && !gotMessage) {
                localStorage.removeItem(JOB_KEY);
                setJob(null);
                return;
            }
            setJob((prev) => prev?.status === 'done'
                ? prev
                : { ...(prev || {}), status: 'error', stage: 'error', message: 'Connection to the server was lost.' });
        };
    };

    // Reconnect to a persisted job on mount so a reload doesn't wipe progress.
    useEffect(() => {
        const savedId = localStorage.getItem(JOB_KEY);
        if (savedId) subscribe(savedId, { isRestore: true });
        return () => esRef.current?.close();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleGenerate = async () => {
        if (!topic.trim() || isBusy) return;
        setJob({ status: 'pending', stage: 'queued', message: 'Starting…', pct: 0 });
        esRef.current?.close();

        try {
            const res = await fetch(`${API_BASE}/api/video/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, aspectRatio, captionStyle, imageMode, scriptMode, language }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start the pipeline.');

            localStorage.setItem(JOB_KEY, data.jobId);
            subscribe(data.jobId);
        } catch (err) {
            setJob({ status: 'error', stage: 'error', message: err.message });
        }
    };

    const postAction = async (action) => {
        if (!job?.id) return;
        try {
            await fetch(`${API_BASE}/api/video/${job.id}/${action}`, { method: 'POST' });
            // Result flows back over the open SSE stream.
        } catch (err) {
            setJob((prev) => ({ ...prev, message: `Action failed: ${err.message}` }));
        }
    };

    // Narrator mode skips the character step entirely.
    const isNarrator = (job?.imageMode || imageMode) === 'narrator';
    const stages = STAGES.filter((s) => !(isNarrator && s.key === 'character'));
    const currentStageIndex = job ? stages.findIndex((s) => s.key === job.stage) : -1;
    const previewAspect = (job?.width && job?.height)
        ? ASPECTS[job.width >= job.height ? '16:9' : '9:16']
        : ASPECTS[aspectRatio];
    const buttonLabel = isRunning ? (STAGE_LABEL[job.stage] || 'Working…')
        : isAwaiting ? 'Awaiting Approval…'
        : isDone ? 'Generate Another' : 'Generate Video';

    return (
        <div className="rounded-3xl border border-hairline bg-surface/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            {/* Topic / script input */}
            <label className="mb-2 block text-sm font-semibold text-slate-300">
                {scriptMode === 'verbatim' ? 'Your script (spoken word-for-word)' : 'Your idea'}
            </label>
            <textarea
                rows={scriptMode === 'verbatim' ? 6 : 4}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isBusy}
                placeholder={scriptMode === 'verbatim'
                    ? 'Paste the exact narration you want spoken. Every word is kept as-is; we only split it into scenes and add visuals…'
                    : 'e.g., A single man explains why active listening wins trust — fast-paced vertical short…'}
                className="w-full resize-y rounded-2xl border border-hairline bg-surface-2 p-4 text-[15px] text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
            />

            {/* Settings */}
            <OptionGroup label="Script" value={scriptMode} onChange={setScriptMode} disabled={isBusy}
                options={Object.entries(SCRIPT_MODES).map(([key, s]) => ({ key, ...s }))} />
            <OptionGroup label="Language" value={language} onChange={setLanguage} disabled={isBusy}
                options={Object.entries(LANGUAGES).map(([key, l]) => ({ key, ...l }))} />
            <OptionGroup label="Format" value={aspectRatio} onChange={setAspectRatio} disabled={isBusy}
                options={Object.entries(ASPECTS).map(([key, a]) => ({ key, label: a.label, sub: a.sub, icon: a.icon }))} />
            <OptionGroup label="Captions" value={captionStyle} onChange={setCaptionStyle} disabled={isBusy}
                options={Object.entries(CAPTION_STYLES).map(([key, c]) => ({ key, ...c }))} />
            <OptionGroup label="Imagery" value={imageMode} onChange={setImageMode} disabled={isBusy} cols={3}
                options={Object.entries(IMAGE_MODES).map(([key, m]) => ({ key, ...m }))} />

            {/* Generate button */}
            <button
                onClick={handleGenerate}
                disabled={isBusy || !topic.trim()}
                className="group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-violet-500 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-brand-600/30 transition hover:shadow-xl hover:shadow-brand-600/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
                {isRunning && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {!isBusy && <span>{isDone ? '🔁' : '🚀'}</span>}
                {buttonLabel}
            </button>

            {/* Stage stepper */}
            {job && (
                <div className="mt-7 flex items-center justify-between gap-1">
                    {stages.map((stage, i) => {
                        const done = isDone || currentStageIndex > i;
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
                                    <span className={['text-[11px] font-medium', active ? 'text-white' : done ? 'text-emerald-300' : 'text-slate-500'].join(' ')}>
                                        {stage.label}
                                    </span>
                                </div>
                                {i < stages.length - 1 && (
                                    <div className={`h-px flex-1 ${currentStageIndex > i || isDone ? 'bg-emerald-500/40' : 'bg-hairline'}`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {/* Character approval card */}
            {isAwaiting && job.character && (
                <div className="mt-7 flex flex-col items-center rounded-2xl border border-brand-500/40 bg-canvas/60 p-6">
                    <h3 className="mb-1 text-lg font-bold text-white">Meet your character</h3>
                    <p className="mb-4 text-center text-sm text-slate-400">Happy with the look? Approve to render. Or regenerate for a different take.</p>
                    <div className="relative overflow-hidden rounded-2xl border-2 border-brand-500/60">
                        <img
                            src={job.character.imageUrl}
                            alt="Character concept"
                            className="block max-h-[320px] w-auto object-contain"
                        />
                        {job.regenerating && (
                            <div className="absolute inset-0 grid place-items-center bg-black/60">
                                <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            </div>
                        )}
                    </div>
                    <div className="mt-5 flex w-full gap-3">
                        <button
                            onClick={() => postAction('regenerate-character')}
                            disabled={job.regenerating}
                            className="flex-1 rounded-2xl border border-hairline bg-surface-2 px-5 py-3.5 font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            🎲 Regenerate
                        </button>
                        <button
                            onClick={() => postAction('approve')}
                            disabled={job.regenerating}
                            className="flex-1 rounded-2xl bg-gradient-to-r from-brand-500 to-violet-500 px-5 py-3.5 font-bold text-white shadow-lg shadow-brand-600/30 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            ✅ Approve &amp; Render
                        </button>
                    </div>
                </div>
            )}

            {/* Progress bar + message (running, not awaiting) */}
            {isRunning && (
                <div className="mt-6">
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-[width] duration-500" style={{ width: `${job.pct || 0}%` }} />
                    </div>
                    <p className="mt-3 text-center text-sm font-medium text-slate-400">{job.message}</p>
                </div>
            )}

            {/* Error */}
            {isError && (
                <p className="mt-6 text-center text-sm font-medium text-red-400">⚠️ {job.message}</p>
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
                        <a href={job.downloadUrl} download
                            className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400">
                            ⬇️ Download Final .MP4
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
