import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { DynamicCaptions } from './DynamicCaptions';

// Crossfade length between scenes (frames). ~0.33s at 30fps.
const FADE = 10;

export const MasterVideo = ({ scenes, captionStyle = 'word' }) => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();
    // Landscape (16:9) art can come back square from providers that ignore the
    // requested size, which a plain object-fit:cover would crop top & bottom.
    // For wide frames we show the whole image (contain) over a blurred, zoomed
    // copy of itself so the frame is filled with no crop and no black bars.
    // Vertical (9:16) is left exactly as before (cover) — a square fills a tall
    // frame cleanly and the blurred bands would be large/ugly there.
    const fillBlur = width >= height;

    if (!scenes || scenes.length === 0) {
        return null;
    }

    // Pre-compute each scene's start/end on the global timeline.
    let acc = 0;
    const timed = scenes.map((s) => {
        const start = acc;
        acc += s.durationInFrames;
        return { ...s, start, end: acc };
    });
    const lastIndex = timed.length - 1;

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            {/* ── Image layers ──────────────────────────────────────────────
                All images are stacked. Each mounts slightly BEFORE its turn
                (so it's loaded), then dissolves in over the previous one which
                stays visible underneath — no black gap at the cut. */}
            {timed.map((scene, i) => {
                // Mount window: from FADE frames before start until fully covered by the next.
                if (frame < scene.start - FADE) return null;
                if (i < lastIndex && frame > scene.end + FADE) return null;

                const local = frame - scene.start;
                const opacity = i === 0
                    ? 1
                    : interpolate(frame, [scene.start, scene.start + FADE], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    });
                // Ken Burns: slow zoom across the scene's own duration.
                const scale = interpolate(local, [0, scene.durationInFrames], [1, 1.15], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                });

                return (
                    <AbsoluteFill key={`img-${i}`} style={{ opacity }}>
                        {fillBlur && scene.imageUrl && (
                            // Blurred, slightly over-zoomed backdrop to fill a wide frame
                            // behind a non-16:9 (e.g. square) image — no black bars.
                            <AbsoluteFill style={{ transform: `scale(${scale * 1.1})`, transformOrigin: 'center center' }}>
                                <Img src={scene.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.6)' }} />
                            </AbsoluteFill>
                        )}
                        <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
                            {scene.imageUrl && (
                                // Wide frame: show the whole image (no crop). Tall frame: cover as before.
                                <Img src={scene.imageUrl} style={{ width: '100%', height: '100%', objectFit: fillBlur ? 'contain' : 'cover' }} />
                            )}
                        </AbsoluteFill>
                    </AbsoluteFill>
                );
            })}

            {/* ── Audio (hard-cut, never overlapping) ──────────────────────── */}
            {timed.map((scene, i) => (
                scene.audioUrl ? (
                    <Sequence key={`aud-${i}`} from={scene.start} durationInFrames={scene.durationInFrames}>
                        <Audio src={scene.audioUrl} playbackRate={1.2} />
                    </Sequence>
                ) : null
            ))}

            {/* ── Captions (per scene) ─────────────────────────────────────── */}
            {timed.map((scene, i) => (
                <Sequence key={`cap-${i}`} from={scene.start} durationInFrames={scene.durationInFrames}>
                    <DynamicCaptions
                        text={scene.narrationText}
                        audioDurationInSeconds={(scene.durationInFrames - 3) / fps}
                        captionStyle={captionStyle}
                        wordTimings={scene.wordTimings}
                    />
                </Sequence>
            ))}
        </AbsoluteFill>
    );
};
