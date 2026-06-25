import React, { useState } from 'react';
import VideoStudio from './components/VideoStudio';
import AnimationStudio from './components/AnimationStudio';

// Two independent modes. "studio" is the existing (untouched) image+narration
// pipeline; "animation" is the new Route-A animated-character experiment.
const MODES = [
  { key: 'studio', label: 'Video Studio', icon: '🎬' },
  { key: 'animation', label: 'Animation Lab', icon: '🎭', badge: 'Beta' },
];

function App() {
  const [mode, setMode] = useState('studio');
  const isAnim = mode === 'animation';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-20 border-b border-hairline/70 bg-canvas/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-lg shadow-lg shadow-brand-600/30">
              🚀
            </span>
            <span className="text-lg font-extrabold tracking-tight text-white">HookCraft</span>
          </div>

          {/* Mode switch */}
          <nav className="flex items-center gap-1 rounded-full border border-hairline bg-surface-2 p-1">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={[
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
                  mode === m.key ? 'bg-gradient-to-r from-brand-500 to-violet-500 text-white shadow' : 'text-slate-400 hover:text-white',
                ].join(' ')}
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
                {m.badge && (
                  <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-200">{m.badge}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero + studio */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <div className="mb-10 text-center">
          <h1 className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl">
            {isAnim ? <>Bring a character<br />to life.</> : <>Type a topic.<br />Get a finished video.</>}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
            {isAnim
              ? 'A proof-of-concept animated character that moves, emotes, and lip-syncs — built in pure code, no GPU, $0.'
              : 'AI writes the script, paints every scene, voices it, and renders a ready-to-post vertical MP4 — all behind a single button.'}
          </p>
        </div>

        {isAnim ? <AnimationStudio /> : <VideoStudio />}
      </main>

      <footer className="border-t border-hairline/60 py-6 text-center text-xs text-slate-600">
        HookCraft · Gemini × FLUX × Remotion
      </footer>
    </div>
  );
}

export default App;
