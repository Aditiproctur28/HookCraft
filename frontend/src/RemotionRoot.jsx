import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { MasterVideo } from './components/MasterVideo'; // Ensure this path matches your folder structure!
import { AnimatedVideo } from './components/AnimatedVideo';

// Shared: measure total duration from per-scene frames + apply aspect dims.
const calculateMetadata = ({ props }) => {
    const totalDuration = (props.scenes || []).reduce((total, scene) => total + scene.durationInFrames, 0);
    return {
        durationInFrames: totalDuration > 0 ? totalDuration : 150,
        width: props.width || 1080,
        height: props.height || 1920,
    };
};

export const RemotionVideo = () => {
    return (
        <>
            <Composition
                id="MasterVideo"
                component={MasterVideo}
                durationInFrames={150} // Fallback duration
                fps={30}
                width={1080}
                height={1920}
                defaultProps={{
                    scenes: [],
                    width: 1080,
                    height: 1920,
                    captionStyle: 'word',
                }}
                calculateMetadata={calculateMetadata}
            />
            {/* Animation Lab: AI motion clips instead of stills */}
            <Composition
                id="AnimatedVideo"
                component={AnimatedVideo}
                durationInFrames={150}
                fps={30}
                width={1080}
                height={1920}
                defaultProps={{
                    scenes: [],
                    width: 1080,
                    height: 1920,
                    captionStyle: 'word',
                }}
                calculateMetadata={calculateMetadata}
            />
        </>
    );
};

registerRoot(RemotionVideo);