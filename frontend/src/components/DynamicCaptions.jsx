import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadDevanagari } from '@remotion/google-fonts/NotoSansDevanagari';

// Load both up front so the font is ready in the live preview AND the headless
// MP4 render (Remotion blocks frames until these resolve). Per-glyph fallback
// means Latin uses Montserrat and Devanagari (Hindi) uses Noto Sans Devanagari.
// Weights are loaded to MATCH the weights used below — otherwise the browser
// fakes the bold, which muddies Devanagari's matras/conjuncts.
const { fontFamily: MONTSERRAT } = loadMontserrat('normal', { weights: ['900'] });
const { fontFamily: DEVANAGARI } = loadDevanagari('normal', { weights: ['700'] });

const DEVANAGARI_RE = /[ऀ-ॿ]/;

const CONTAINER_STYLE = {
  position: 'absolute',
  bottom: '15%',
  width: '100%',
  textAlign: 'center',
  padding: '0 50px',
  fontSize: '65px',
  fontFamily: `${MONTSERRAT}, "${DEVANAGARI}", sans-serif`,
  zIndex: 10,
};

// English: heavy weight + thick stroke (the punchy look). Hindi: lighter weight
// and a thin stroke — Devanagari has stacked vowel marks and conjuncts that a
// 2px stroke fills in and turns into unreadable blobs.
const LATIN_TEXT = {
  fontWeight: '900',
  textTransform: 'uppercase',
  lineHeight: '1.6',
};
const HINDI_TEXT = {
  fontWeight: '700',
  textTransform: 'none',
  lineHeight: '1.9',
};
// paintOrder: 'stroke' draws the outline FIRST, then the fill on top — so the
// stroke only grows outward and never eats into the letterforms (the default
// centered stroke is what made the insides of letters look crumbled).
const LATIN_SHADOW = {
  textShadow: '4px 4px 0px #000000, -2px -2px 0px #000000, 2px -2px 0px #000000, -2px 2px 0px #000000, 2px 2px 0px #000000',
  WebkitTextStroke: '2px black',
  paintOrder: 'stroke',
};
const HINDI_SHADOW = {
  textShadow: '3px 3px 4px #000000, 0 0 6px #000000',
  WebkitTextStroke: '1px black',
  paintOrder: 'stroke',
};

// Pick legibility treatment from the text itself, so we don't have to thread the
// language all the way down here.
function styleFor(text) {
  const hindi = DEVANAGARI_RE.test(text || '');
  return {
    container: { ...CONTAINER_STYLE, ...(hindi ? HINDI_TEXT : LATIN_TEXT) },
    shadow: hindi ? HINDI_SHADOW : LATIN_SHADOW,
  };
}

function cleanWords(text) {
  // Keep Latin, digits, and the Devanagari block (U+0900–U+097F, incl. the "।" danda)
  // so Hindi captions survive instead of being stripped to nothing.
  return text.replace(/[^a-zA-Z0-9ऀ-ॿ\s'-?,.!]/g, '').split(' ').filter(Boolean);
}

// Word-by-word: each word pops in on its beat. When we have real per-word
// timings from the TTS engine we sync to those exactly; otherwise we fall back
// to spreading the words evenly across the audio (a rough approximation).
function WordByWord({ text, audioDurationInSeconds, wordTimings }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { container, shadow } = styleFor(text);

  const hasTimings = Array.isArray(wordTimings) && wordTimings.length > 0;
  const timeSec = frame / fps;

  // Normalize to a common shape: { word, startFrame, endFrame }.
  const beats = hasTimings
    ? wordTimings.map((w) => ({
        word: w.text,
        startFrame: w.start * fps,
        endFrame: w.end * fps,
      }))
    : (() => {
        const words = cleanWords(text);
        const framesPerWord = Math.floor(audioDurationInSeconds * fps) / words.length;
        return words.map((word, i) => ({
          word,
          startFrame: i * framesPerWord,
          endFrame: (i + 1) * framesPerWord,
        }));
      })();

  return (
    <div style={container}>
      {beats.map((b, index) => {
        if (frame < b.startFrame) return null;
        const isCurrent = frame >= b.startFrame && frame < b.endFrame;
        const scale = spring({ fps, frame: frame - b.startFrame, config: { damping: 12, stiffness: 200, mass: 0.5 } });
        return (
          <span
            key={index}
            style={{
              color: isCurrent ? '#FFD700' : '#FFFFFF',
              transform: isCurrent ? `scale(${scale})` : 'scale(1)',
              display: 'inline-block',
              marginRight: '15px',
              ...shadow,
            }}
          >
            {b.word}
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
  const { container, shadow } = styleFor(text);
  const enter = spring({ fps, frame, config: { damping: 14, stiffness: 160, mass: 0.6 } });
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ ...container, opacity }}>
      <span
        style={{
          color: '#FFFFFF',
          display: 'inline-block',
          transform: `scale(${0.85 + enter * 0.15})`,
          ...shadow,
        }}
      >
        {cleanWords(text).join(' ')}
      </span>
    </div>
  );
}

export const DynamicCaptions = ({ text, audioDurationInSeconds, captionStyle = 'word', wordTimings }) => {
  if (!text) return null;
  return captionStyle === 'sentence'
    ? <FullSentence text={text} />
    : <WordByWord text={text} audioDurationInSeconds={audioDurationInSeconds} wordTimings={wordTimings} />;
};
