import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useVideoConfig, interpolate, useCurrentFrame } from 'remotion';
import { DynamicCaptions } from './DynamicCaptions';

// Crossfade length between scenes (frames). ~0.27s at 30fps.
const FADE = 8;

/**
 * The "Animation Lab" composition: each scene is a short AI-generated motion
 * CLIP (from LTX-Video) instead of a still + Ken Burns. We stretch each clip's
 * playback to exactly fill its scene so there's never a black gap or a visible
 * loop, then layer the existing narration audio + captions on top.
 *
 * scenes: [{ clipUrl, audioUrl, narrationText, durationInFrames, wordTimings, clipDurationSec }]
 */
export const AnimatedVideo = ({ scenes, captionStyle = 'word' }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    if (!scenes || scenes.length === 0) return null;

    let acc = 0;
    const timed = scenes.map((s) => {
        const start = acc;
        acc += s.durationInFrames;
        return { ...s, start, end: acc };
    });
    const lastIndex = timed.length - 1;

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            {/* ── Video clip layers (dissolve into one another at the cut) ──── */}
            {timed.map((scene, i) => {
                if (frame < scene.start - FADE) return null;
                if (i < lastIndex && frame > scene.end + FADE) return null;

                const sceneSec = scene.durationInFrames / fps;
                // Stretch (or compress) the clip so it spans the whole scene:
                // playbackRate < 1 slows a short clip to fill a longer narration.
                const rate = scene.clipDurationSec && sceneSec
                    ? Math.max(0.25, Math.min(4, scene.clipDurationSec / sceneSec))
                    : 1;

                const opacity = i === 0
                    ? 1
                    : interpolate(frame, [scene.start, scene.start + FADE], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    });

                return (
                    <AbsoluteFill key={`clip-${i}`} style={{ opacity }}>
                        {scene.clipUrl && (
                            <OffthreadVideo
                                src={scene.clipUrl}
                                playbackRate={rate}
                                muted
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        )}
                    </AbsoluteFill>
                );
            })}

            {/* ── Narration audio (hard-cut, never overlapping) ─────────────── */}
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
