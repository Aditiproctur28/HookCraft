import React from 'react';
import { AbsoluteFill, Audio, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { DynamicCaptions } from './DynamicCaptions';

export const VideoComposition = ({ imageUrl, audioUrl, narrationText, captionStyle = 'word' }) => {
    const frame = useCurrentFrame();
    const { durationInFrames, fps } = useVideoConfig();

    const scale = interpolate(frame, [0, durationInFrames], [1, 1.15], {
        extrapolateRight: 'clamp',
    });

    // 🚀 SYNC FIX: Subtract the 15-frame safety buffer from the total duration!
    // This forces the text to finish exactly when the sped-up audio finishes.
    const audioDurationInSeconds = (durationInFrames - 15) / fps;

    return (
        <AbsoluteFill style={{ backgroundColor: 'black', overflow: 'hidden' }}>
            
            {/* The Audio Track - Sped up by 20% */}
            {audioUrl && <Audio src={audioUrl} playbackRate={1.2} />}

            {/* The Animated Background */}
            <AbsoluteFill style={{ 
                transform: `scale(${scale})`,
                transformOrigin: 'center center'
            }}>
                {imageUrl && (
                    <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
            </AbsoluteFill>

            {/* The Dynamic Text Overlay */}
            <DynamicCaptions
                text={narrationText}
                audioDurationInSeconds={audioDurationInSeconds}
                captionStyle={captionStyle}
            />

        </AbsoluteFill>
    );
};