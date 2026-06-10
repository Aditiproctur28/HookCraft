import React from 'react';
import { useCurrentFrame, useVideoConfig, spring } from 'remotion';

export const DynamicCaptions = ({ text, audioDurationInSeconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Clean the text and split into an array of words
  const words = text.replace(/[^a-zA-Z0-9\s'-?,.!]/g, '').split(' ').filter(Boolean);
  
  // Calculate timing: divide the TRUE audio length by the number of words
  const totalFrames = Math.floor(audioDurationInSeconds * fps);
  const framesPerWord = totalFrames / words.length;

  return (
    <div style={{
      position: 'absolute',
      bottom: '15%',
      width: '100%',
      // 🚀 OVERLAP FIX: Removed flexbox. Using native text alignment and strict line-height.
      textAlign: 'center',
      padding: '0 50px',
      fontSize: '65px',
      fontWeight: '900',
      fontFamily: 'Montserrat, sans-serif',
      textTransform: 'uppercase',
      lineHeight: '1.6', // Adds massive vertical breathing room between rows
      zIndex: 10,
    }}>
      {words.map((word, index) => {
        const startFrame = index * framesPerWord;
        
        const isCurrent = frame >= startFrame && frame < startFrame + framesPerWord;
        
        if (frame < startFrame) return null;

        const scale = spring({
          fps,
          frame: frame - startFrame,
          config: { damping: 12, stiffness: 200, mass: 0.5 },
        });

        return (
          <span 
            key={index} 
            style={{
              color: isCurrent ? '#FFD700' : '#FFFFFF',
              transform: isCurrent ? `scale(${scale})` : 'scale(1)',
              display: 'inline-block',
              marginRight: '15px', // Horizontal spacing between words
              textShadow: '4px 4px 0px #000000, -2px -2px 0px #000000, 2px -2px 0px #000000, -2px 2px 0px #000000, 2px 2px 0px #000000',
              WebkitTextStroke: '2px black',
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};