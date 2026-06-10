import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

const CONTAINER_STYLE = {
  position: 'absolute',
  bottom: '15%',
  width: '100%',
  textAlign: 'center',
  padding: '0 50px',
  fontSize: '65px',
  fontWeight: '900',
  fontFamily: 'Montserrat, sans-serif',
  textTransform: 'uppercase',
  lineHeight: '1.6',
  zIndex: 10,
};

const WORD_SHADOW = {
  textShadow: '4px 4px 0px #000000, -2px -2px 0px #000000, 2px -2px 0px #000000, -2px 2px 0px #000000, 2px 2px 0px #000000',
  WebkitTextStroke: '2px black',
};

function cleanWords(text) {
  return text.replace(/[^a-zA-Z0-9\s'-?,.!]/g, '').split(' ').filter(Boolean);
}

// Word-by-word: each word pops in on its timed beat (the original behavior).
function WordByWord({ text, audioDurationInSeconds }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = cleanWords(text);
  const totalFrames = Math.floor(audioDurationInSeconds * fps);
  const framesPerWord = totalFrames / words.length;

  return (
    <div style={CONTAINER_STYLE}>
      {words.map((word, index) => {
        const startFrame = index * framesPerWord;
        if (frame < startFrame) return null;
        const isCurrent = frame >= startFrame && frame < startFrame + framesPerWord;
        const scale = spring({ fps, frame: frame - startFrame, config: { damping: 12, stiffness: 200, mass: 0.5 } });
        return (
          <span
            key={index}
            style={{
              color: isCurrent ? '#FFD700' : '#FFFFFF',
              transform: isCurrent ? `scale(${scale})` : 'scale(1)',
              display: 'inline-block',
              marginRight: '15px',
              ...WORD_SHADOW,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

// Full-sentence: the whole line appears at once with a single spring entrance.
function FullSentence({ text }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 14, stiffness: 160, mass: 0.6 } });
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ ...CONTAINER_STYLE, opacity }}>
      <span
        style={{
          color: '#FFFFFF',
          display: 'inline-block',
          transform: `scale(${0.85 + enter * 0.15})`,
          ...WORD_SHADOW,
        }}
      >
        {cleanWords(text).join(' ')}
      </span>
    </div>
  );
}

export const DynamicCaptions = ({ text, audioDurationInSeconds, captionStyle = 'word' }) => {
  if (!text) return null;
  return captionStyle === 'sentence'
    ? <FullSentence text={text} />
    : <WordByWord text={text} audioDurationInSeconds={audioDurationInSeconds} />;
};
