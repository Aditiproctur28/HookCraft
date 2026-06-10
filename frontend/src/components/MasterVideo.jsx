import React from 'react';
import { Series, AbsoluteFill, Audio } from 'remotion'; // You can also import staticFile from 'remotion' later
import { VideoComposition } from './VideoComposition';

export const MasterVideo = ({ scenes, captionStyle = 'word' }) => {
    if (!scenes || scenes.length === 0) {
        return null;
    }

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            
            {/* 
              TEMPORARILY DISABLED FOR EXPORT
              Headless Chrome timed out trying to download this external URL.
              For production, download a song, place it in your frontend 'public' folder, 
              and use: src={staticFile("my-song.mp3")}
            */}
            {/* 
            <Audio 
                src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
                volume={0.1} 
                loop
            /> 
            */}

            {/* The Main Video Timeline */}
            <Series>
                {scenes.map((scene, index) => (
                    <Series.Sequence 
                        key={index} 
                        durationInFrames={scene.durationInFrames}
                    >
                        <VideoComposition
                            imageUrl={scene.imageUrl}
                            audioUrl={scene.audioUrl}
                            narrationText={scene.narrationText}
                            captionStyle={captionStyle}
                        />
                    </Series.Sequence>
                ))}
            </Series>

        </AbsoluteFill>
    );
};