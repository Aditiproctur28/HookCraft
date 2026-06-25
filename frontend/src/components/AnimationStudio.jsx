import React, { useState, useRef, useEffect } from 'react';
import { Player } from '@remotion/player';
import { AnimatedVideo } from './AnimatedVideo';
import { API_BASE } from '../config';

const STAGES = [
    { key: 'script', label: 'Script', icon: '✍️' },
    { key: 'artwork', label: 'Stills', icon: '🎨' },
    { key: 'voiceover', label: 'Voice', icon: '🎙️' },
    { key: 'animate', label: 'Animate', icon: '🎬' },
    { key: 'render', label: 'Render', icon: '🎞️' },
];
// Monotonic order so the stepper never jumps backwards while we loop per scene.
const STAGE_ORDER = ['script', 'artwork', 'voiceover', 'animate', 'render', 'done'];

const ASPECTS = {
    '9:16': { label: 'Vertical', sub: '9:16', icon: '📱', compW: 1080, compH: 1920, viewW: 288, viewH: 512 },
    '16:9': { label: 'Horizontal', sub: '16:9', icon: '🖥️', compW: 1920, compH: 1080, viewW: 512, viewH: 288 },
};
const CAPTION_STYLES = {
    word: { label: 'Word-by-Word', sub: 'Snappy pop-ins', icon: '✨' },
    sentence: { label: 'Full Sentence', sub: 'Whole line per scene', icon: '📝' },
};
const SCRIPT_MODES = {
    auto: { label: 'Auto-Generate', sub: 'AI writes the script', icon: '🤖' },
    verbatim: { label: 'Use My Words', sub: 'Speak my script exactly', icon: '📄' },
};
const NARRATION_MODES = {
    on: { label: 'With Voiceover', sub: 'Narration + captions', icon: '🎙️' },
    off: { label: 'Silent', sub: 'Visuals only, no voice', icon: '🔇' },
};
const LANGUAGES = {
    en: { label: 'English', sub: 'US neural voice', icon: '🇺🇸' },
    hi: { label: 'Hindi', sub: 'हिंदी आवाज़', icon: '🇮🇳' },
};

const JOB_KEY = 'hookcraft.animJobId';
const FORM_KEY = 'hookcraft.animForm';
const FORM_DEFAULTS = { topic: '', aspectRatio: '9:16', captionStyle: 'word', scriptMode: 'auto', language: 'en', narration: 'on' };

function loadForm() {
    try {
        const saved = JSON.parse(localStorage.getItem(FORM_KEY));
        return saved ? { ...FORM_DEFAULTS, ...saved } : FORM_DEFAULTS;
    } catch {
        return FORM_DEFAULTS;
    }
}

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
                                    ? 'border-violet-500 bg-violet-500/15 ring-2 ring-violet-500/30'
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

export default function AnimationStudio() {
    const [initial] = useState(loadForm);
    const [topic, setTopic] = useState(initial.topic);
    const [aspectRatio, setAspectRatio] = useState(initial.aspectRatio);
    const [captionStyle, setCaptionStyle] = useState(initial.captionStyle);
    const [scriptMode, setScriptMode] = useState(initial.scriptMode);
    const [language, setLanguage] = useState(initial.language);
    const [narration, setNarration] = useState(initial.narration);
    const [job, setJob] = useState(null);
    const esRef = useRef(null);
    const silent = narration === 'off';

    useEffect(() => {
        localStorage.setItem(FORM_KEY, JSON.stringify({ topic, aspectRatio, captionStyle, scriptMode, language, narration }));
    }, [topic, aspectRatio, captionStyle, scriptMode, language, narration]);

    const status = job?.status;
    const isRunning = status === 'pending' || status === 'running';
    const isDone = status === 'done';
    const isError = status === 'error';

    const subscribe = (jobId, { isRestore = false } = {}) => {
        esRef.current?.close();
        const es = new EventSource(`${API_BASE}/api/animation/progress/${jobId}`);
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

    useEffect(() => {
        const savedId = localStorage.getItem(JOB_KEY);
        if (savedId) subscribe(savedId, { isRestore: true });
        return () => esRef.current?.close();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleGenerate = async () => {
        if (!topic.trim() || isRunning) return;
        setJob({ status: 'pending', stage: 'script', message: 'Starting…', pct: 0 });
        esRef.current?.close();
        try {
            const res = await fetch(`${API_BASE}/api/animation/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Silent mode has no spoken script, so verbatim doesn't apply.
                body: JSON.stringify({ topic, aspectRatio, captionStyle, scriptMode: silent ? 'auto' : scriptMode, language, narration }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start the pipeline.');
            localStorage.setItem(JOB_KEY, data.jobId);
            subscribe(data.jobId);
        } catch (err) {
            setJob({ status: 'error', stage: 'error', message: err.message });
        }
    };

    const reachedIndex = job ? STAGE_ORDER.indexOf(job.stage) : -1;
    const previewAspect = (job?.width && job?.height)
        ? ASPECTS[job.width >= job.height ? '16:9' : '9:16']
        : ASPECTS[aspectRatio];
    const buttonLabel = isRunning ? (job.message || 'Working…') : isDone ? 'Generate Another' : 'Generate Animation';

    return (
        <div className="rounded-3xl border border-hairline bg-surface/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            <div className="mb-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3 text-center text-xs text-violet-200">
                ⏳ Heads-up: real AI animation is slow on the free engine — expect <b>~3–6 min per scene</b>. Keep this tab open.
            </div>

            <label className="mb-2 block text-sm font-semibold text-slate-300">
                {(!silent && scriptMode === 'verbatim') ? 'Your script (spoken word-for-word)' : 'Your idea'}
            </label>
            <textarea
                rows={(!silent && scriptMode === 'verbatim') ? 6 : 4}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isRunning}
                placeholder={silent
                    ? 'Describe the scene/action you want to SEE (no narration) — e.g., A cute cat fishing in a boat catches a fish that flips back into the river…'
                    : (scriptMode === 'verbatim'
                        ? 'Paste the exact narration you want spoken…'
                        : 'e.g., A chubby orange cat goes on a tiny adventure through a sunny meadow…')}
                className="w-full resize-y rounded-2xl border border-hairline bg-surface-2 p-4 text-[15px] text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/40 disabled:opacity-60"
            />

            {/* Voiceover on/off — silent hides the narration-only options below. */}
            <OptionGroup label="Voiceover" value={narration} onChange={setNarration} disabled={isRunning}
                options={Object.entries(NARRATION_MODES).map(([key, m]) => ({ key, ...m }))} />
            {!silent && (
                <OptionGroup label="Script" value={scriptMode} onChange={setScriptMode} disabled={isRunning}
                    options={Object.entries(SCRIPT_MODES).map(([key, s]) => ({ key, ...s }))} />
            )}
            {!silent && (
                <OptionGroup label="Language" value={language} onChange={setLanguage} disabled={isRunning}
                    options={Object.entries(LANGUAGES).map(([key, l]) => ({ key, ...l }))} />
            )}
            <OptionGroup label="Format" value={aspectRatio} onChange={setAspectRatio} disabled={isRunning}
                options={Object.entries(ASPECTS).map(([key, a]) => ({ key, label: a.label, sub: a.sub, icon: a.icon }))} />
            {!silent && (
                <OptionGroup label="Captions" value={captionStyle} onChange={setCaptionStyle} disabled={isRunning}
                    options={Object.entries(CAPTION_STYLES).map(([key, c]) => ({ key, ...c }))} />
            )}

            <button
                onClick={handleGenerate}
                disabled={isRunning || !topic.trim()}
                className="group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-violet-600/30 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
                {isRunning && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {!isRunning && <span>{isDone ? '🔁' : '🎬'}</span>}
                <span className="truncate">{buttonLabel}</span>
            </button>

            {/* Stage stepper (silent mode skips the voiceover step) */}
            {job && (() => {
                const stages = silent ? STAGES.filter((s) => s.key !== 'voiceover') : STAGES;
                return (
                <div className="mt-7 flex items-center justify-between gap-1">
                    {stages.map((stage, i) => {
                        const stageIdx = STAGE_ORDER.indexOf(stage.key);
                        const done = isDone || reachedIndex > stageIdx;
                        const active = !isDone && job.stage === stage.key;
                        return (
                            <React.Fragment key={stage.key}>
                                <div className="flex flex-1 flex-col items-center gap-1.5">
                                    <div className={[
                                        'grid h-10 w-10 place-items-center rounded-full border text-base transition',
                                        done ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                            : active ? 'border-violet-500 bg-violet-500/20 text-white ring-4 ring-violet-500/20'
                                            : 'border-hairline bg-surface-2 text-slate-500',
                                    ].join(' ')}>
                                        {done ? '✓' : stage.icon}
                                    </div>
                                    <span className={['text-[11px] font-medium', active ? 'text-white' : done ? 'text-emerald-300' : 'text-slate-500'].join(' ')}>
                                        {stage.label}
                                    </span>
                                </div>
                                {i < stages.length - 1 && (
                                    <div className={`h-px flex-1 ${reachedIndex > stageIdx || isDone ? 'bg-emerald-500/40' : 'bg-hairline'}`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
                );
            })()}

            {isRunning && (
                <div className="mt-6">
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-500" style={{ width: `${job.pct || 0}%` }} />
                    </div>
                    <p className="mt-3 text-center text-sm font-medium text-slate-400">{job.message}</p>
                </div>
            )}

            {isError && (
                <p className="mt-6 text-center text-sm font-medium text-red-400">⚠️ {job.message}</p>
            )}

            {isDone && job.scenes?.length > 0 && (
                <div className="mt-8 flex flex-col items-center rounded-2xl border border-hairline bg-canvas/60 p-6">
                    <h3 className="mb-5 flex items-center gap-2 text-lg font-bold text-white">
                        <span className="text-emerald-400">✅</span> Your animation is ready
                    </h3>
                    <div className="overflow-hidden rounded-[20px] border-2 border-violet-500/60 shadow-2xl shadow-violet-600/20">
                        <Player
                            component={AnimatedVideo}
                            inputProps={{ scenes: job.scenes, captionStyle: job.captionStyle || captionStyle }}
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
