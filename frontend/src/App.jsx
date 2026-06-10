import React, { useState } from 'react';
import ScriptInput from './components/ScriptInput';
import Storyboard from './components/StoryBoard';

function App() {
  // This state is the "bridge". 
  // ScriptInput updates it, and Storyboard reads it.
  const [scriptData, setScriptData] = useState(null);

  return (
    <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      
      {/* App Header */}
      <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '42px', color: '#111827', margin: '0 0 10px 0', letterSpacing: '-1px' }}>
          🚀 HookCraft
        </h1>
        <p style={{ fontSize: '18px', color: '#6b7280', margin: 0 }}>
          AI-Powered Vertical Video Storyboard Engine
        </p>
      </div>

      {/* 1. The Input Form */}
      {/* When the form finishes, it sends the data here, and we save it to our state */}
      <ScriptInput onScriptGenerated={(data) => setScriptData(data)} />

      {/* 2. The Storyboard Display */}
      {/* We pass the saved data down into the storyboard to be drawn on screen */}
      <Storyboard scriptData={scriptData} />
      
    </div>
  );
}

export default App;