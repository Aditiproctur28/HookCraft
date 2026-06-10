import React from 'react';
import VideoStudio from './components/VideoStudio';

function App() {
  return (
    <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', padding: '40px 20px', fontFamily: 'sans-serif' }}>

      {/* App Header */}
      <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '42px', color: '#111827', margin: '0 0 10px 0', letterSpacing: '-1px' }}>
          🚀 HookCraft
        </h1>
        <p style={{ fontSize: '18px', color: '#6b7280', margin: 0 }}>
          Type a topic. Get a finished vertical video.
        </p>
      </div>

      {/* The entire pipeline runs behind a single button */}
      <VideoStudio />

    </div>
  );
}

export default App;
