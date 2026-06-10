import React from 'react';
import VideoStudio from './components/VideoStudio';

function App() {
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
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            100% Free · Local Render
          </span>
        </div>
      </header>

      {/* Hero + studio */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <div className="mb-10 text-center">
          <h1 className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl">
            Type a topic.<br />Get a finished video.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
            AI writes the script, paints every scene, voices it, and renders a ready-to-post
            vertical MP4 — all behind a single button.
          </p>
        </div>

        <VideoStudio />
      </main>

      <footer className="border-t border-hairline/60 py-6 text-center text-xs text-slate-600">
        HookCraft · Gemini × FLUX × Remotion
      </footer>
    </div>
  );
}

export default App;
