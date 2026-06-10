import React, { useState, useRef, useEffect } from 'react';
import { Player } from '@remotion/player';
import { MasterVideo } from './MasterVideo';
import { API_BASE } from '../config';

// Maps backend stages → a short status label shown on the button.
const STAGE_LABEL = {
    queued: 'Starting…',
    script: 'Generating Script…',
    artwork: 'Creating AI Artwork…',
    voiceover: 'Generating Voiceover…',
    render: 'Rendering Final MP4…',
    done: 'Done!',
    error: 'Failed',
};

export default function VideoStudio() {
    const [topic, setTopic] = useState('');
    const [job, setJob] = useState(null); // { status, stage, message, pct, scenes, totalDurationInFrames, downloadUrl, error }
    const esRef = useRef(null);

    const isRunning = job && (job.status === 'pending' || job.status === 'running');
    const isDone = job && job.status === 'done';
    const isError = job && job.status === 'error';

    // Clean up any open SSE connection on unmount.
    useEffect(() => () => esRef.current?.close(), []);

    const handleGenerate = async () => {
        if (!topic.trim() || isRunning) return;

        // Reset and optimistically show the queued state.
        setJob({ status: 'pending', stage: 'queued', message: 'Starting…', pct: 0 });
        esRef.current?.close();

        try {
            const res = await fetch(`${API_BASE}/api/video/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start the pipeline.');

            // Subscribe to the live progress stream.
            const es = new EventSource(`${API_BASE}/api/video/progress/${data.jobId}`);
            esRef.current = es;

            es.onmessage = (event) => {
                const update = JSON.parse(event.data);
                setJob(update);
                if (update.status === 'done' || update.status === 'error') {
                    es.close();
                }
            };
            es.onerror = () => {
                // Network drop / server closed unexpectedly.
                es.close();
                setJob((prev) => prev?.status === 'done'
                    ? prev
                    : { ...(prev || {}), status: 'error', stage: 'error', message: 'Connection to the server was lost.' });
            };
        } catch (err) {
            setJob({ status: 'error', stage: 'error', message: err.message });
        }
    };

    const buttonLabel = isRunning
        ? (STAGE_LABEL[job.stage] || job.message || 'Working…')
        : (isDone ? '🔁 Generate Another' : '🚀 Generate Video');

    const totalDuration = job?.totalDurationInFrames || 0;

    return (
        <div style={{ maxWidth: '640px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            {/* Topic input */}
            <textarea
                rows="4"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isRunning}
                placeholder="e.g., A single man explains why active listening wins trust, fast-paced vertical short…"
                style={{
                    width: '100%', padding: '14px', borderRadius: '10px',
                    border: '1px solid #d1d5db', fontSize: '16px', resize: 'vertical',
                    boxSizing: 'border-box', fontFamily: 'inherit',
                }}
            />

            {/* The single Generate button */}
            <button
                onClick={handleGenerate}
                disabled={isRunning || !topic.trim()}
                style={{
                    marginTop: '14px', width: '100%', padding: '16px',
                    backgroundColor: isRunning ? '#6366f1' : (!topic.trim() ? '#9ca3af' : '#4f46e5'),
                    color: 'white', border: 'none', borderRadius: '12px',
                    fontSize: '18px', fontWeight: 'bold',
                    cursor: isRunning || !topic.trim() ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s',
                }}
            >
                {isRunning && '⚙️ '}{buttonLabel}
            </button>

            {/* Progress bar + live message */}
            {job && !isDone && (
                <div style={{ marginTop: '18px' }}>
                    <div style={{ height: '10px', backgroundColor: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', width: `${job.pct || 0}%`,
                            backgroundColor: isError ? '#ef4444' : '#4f46e5',
                            transition: 'width 0.4s ease',
                        }} />
                    </div>
                    <p style={{
                        marginTop: '10px', textAlign: 'center', fontSize: '14px',
                        color: isError ? '#dc2626' : '#6b7280', fontWeight: 500,
                    }}>
                        {isError ? `❌ ${job.message}` : job.message}
                    </p>
                </div>
            )}

            {/* Preview + download */}
            {isDone && job.scenes?.length > 0 && (
                <div style={{
                    marginTop: '28px', padding: '24px', backgroundColor: '#111827',
                    borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                }}>
                    <h3 style={{ color: 'white', marginTop: 0, marginBottom: '18px' }}>✅ Your Video is Ready</h3>
                    <div style={{ borderRadius: '12px', overflow: 'hidden', border: '2px solid #4f46e5' }}>
                        <Player
                            component={MasterVideo}
                            inputProps={{ scenes: job.scenes }}
                            durationInFrames={Math.max(totalDuration, 150)}
                            fps={30}
                            compositionWidth={1080}
                            compositionHeight={1920}
                            style={{ width: '280px', height: '498px' }}
                            controls
                            autoPlay
                        />
                    </div>
                    {job.downloadUrl && (
                        <a
                            href={job.downloadUrl}
                            download
                            style={{
                                marginTop: '20px', display: 'inline-block', backgroundColor: '#10b981',
                                color: 'white', padding: '14px 28px', borderRadius: '999px',
                                textDecoration: 'none', fontWeight: 'bold', fontSize: '17px',
                            }}
                        >
                            ⬇️ Download Final .MP4
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
