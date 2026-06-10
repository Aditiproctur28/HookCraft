import React, { useState } from 'react';
import { Player } from '@remotion/player'; 
import { getAudioDurationInSeconds } from '@remotion/media-utils'; 
import { MasterVideo } from './MasterVideo'; 

export default function Storyboard({ scriptData }) {
    const [audioTracks, setAudioTracks] = useState({});
    const [imageTracks, setImageTracks] = useState({});
    const [sceneDurations, setSceneDurations] = useState({}); 
    
    const [loadingAudio, setLoadingAudio] = useState(null);
    const [loadingImage, setLoadingImage] = useState(null);
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);
    
    // NEW STATES FOR MP4 EXPORT
    const [isRenderingVideo, setIsRenderingVideo] = useState(false);
    const [downloadLink, setDownloadLink] = useState(null);

    if (!scriptData) return null;

    const { video_metrics, scenes } = scriptData;

    const handleGenerateAudio = async (sceneNumber, narrationText,voiceType) => {
        setLoadingAudio(sceneNumber);
        try {
            const response = await fetch('http://localhost:3001/api/audio/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene_number: sceneNumber,
                    narration_text: narrationText,
                    voice_type: voiceType
                }),
            });

            const data = await response.json();

            if (data.success) {
                const audioUrl = `http://localhost:3001${data.file_path}`;
                
                // 🚀 NEW MATH: Divide the duration by 1.2 to account for the faster playback!
                const originalDuration = await getAudioDurationInSeconds(audioUrl);
                const fastDuration = originalDuration / 1.2; 
                
                const fps = 30;
                const durationInFrames = Math.ceil(fastDuration * fps) + 15; 

                setAudioTracks((prev) => ({
                    ...prev,
                    [sceneNumber]: audioUrl,
                }));
                setSceneDurations((prev) => ({
                    ...prev,
                    [sceneNumber]: durationInFrames, 
                }));
            } else {
                console.error(`Audio Error Scene ${sceneNumber}:`, data.error);
            }
        } catch (error) {
            console.error('Audio generation network error:', error);
        } finally {
            setLoadingAudio(null);
        }
    };

    const handleGenerateImage = async (sceneNumber, visualPrompt) => {
        setLoadingImage(sceneNumber);
        try {
            const response = await fetch('http://localhost:3001/api/images/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scene_number: sceneNumber,
                    visual_prompt: visualPrompt,
                }),
            });

            const data = await response.json();

            if (data.success) {
                setImageTracks((prev) => ({
                    ...prev,
                    [sceneNumber]: `http://localhost:3001${data.file_path}`,
                }));
            } else {
                console.error(`Image Error Scene ${sceneNumber}:`, data.error);
            }
        } catch (error) {
            console.error('Image generation network error:', error);
        } finally {
            setLoadingImage(null);
        }
    };

    const handleGenerateAll = async () => {
        setIsGeneratingAll(true);
        
        for (const scene of scenes) {
            const sceneNum = scene.scene_number;
            
            if (!audioTracks[sceneNum]) {
                await handleGenerateAudio(sceneNum, scene.narration_text,scene.voice_type);
            }
            if (!imageTracks[sceneNum]) {
                await handleGenerateImage(sceneNum, scene.visual_prompt);
            }
        }

        setIsGeneratingAll(false);
    };

    // NEW EXPORT FUNCTION
    const handleExportVideo = async () => {
        setIsRenderingVideo(true);
        try {
            const response = await fetch('http://localhost:3001/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    scenes: readyScenes,
                    totalDurationInFrames: totalVideoDuration
                }),
            });

            const data = await response.json();
            if (data.success) {
                setDownloadLink(`http://localhost:3001${data.downloadUrl}`);
            } else {
                console.error("Export failed:", data.error);
                alert("Video rendering failed. Check backend console.");
            }
        } catch (error) {
            console.error("Network error during export:", error);
        } finally {
            setIsRenderingVideo(false);
        }
    };

    const readyScenes = scenes
        .filter(scene => audioTracks[scene.scene_number] && imageTracks[scene.scene_number])
        .map(scene => ({
            ...scene,
            audioUrl: audioTracks[scene.scene_number],
            imageUrl: imageTracks[scene.scene_number],
            narrationText: scene.narration_text,
            durationInFrames: sceneDurations[scene.scene_number] || 150 
        }));

    const totalVideoDuration = readyScenes.reduce((total, scene) => total + scene.durationInFrames, 0);

    return (
        <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
            
            <div style={{ backgroundColor: '#f3f4f6', padding: '20px', borderRadius: '12px', marginBottom: '30px', textAlign: 'center' }}>
                <h2 style={{ margin: '0 0 10px 0', color: '#111827' }}>🎬 Video Storyboard Ready</h2>
                <div style={{ display: 'inline-block', backgroundColor: '#e0e7ff', color: '#4338ca', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold' }}>
                    ⏱️ Estimated Duration: ~{video_metrics.estimated_duration_seconds || video_metrics.estimated_duration} seconds
                </div>

                {readyScenes.length !== scenes.length && (
                    <button 
                        onClick={handleGenerateAll}
                        disabled={isGeneratingAll}
                        style={{
                            display: 'block',
                            margin: '20px auto 10px auto',
                            padding: '16px 32px',
                            backgroundColor: isGeneratingAll ? '#9ca3af' : '#10b981',
                            color: 'white',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            border: 'none',
                            borderRadius: '50px',
                            cursor: isGeneratingAll ? 'not-allowed' : 'pointer',
                            boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.4)',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isGeneratingAll ? '⚙️ AI is generating sequentially... Please wait.' : '🚀 1-Click Generate Entire Video'}
                    </button>
                )}
            </div>

            {readyScenes.length > 0 && (
                <div style={{ 
                    marginBottom: '40px', 
                    padding: '20px', 
                    backgroundColor: '#111827', 
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                }}>
                    <h3 style={{ color: 'white', marginTop: 0, marginBottom: '20px' }}>
                        {readyScenes.length === scenes.length ? '✅ Final Video Preview' : '🌟 Live Assembling Preview...'}
                    </h3>
                    <div style={{
                        borderRadius: '12px',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        border: '2px solid #4338ca'
                    }}>
                        <Player
                            component={MasterVideo}
                            inputProps={{ scenes: readyScenes }}
                            durationInFrames={Math.max(totalVideoDuration, 150)} 
                            fps={30}
                            compositionWidth={1080}
                            compositionHeight={1920}
                            style={{ width: '280px', height: '498px' }} 
                            controls
                            autoPlay
                        />
                    </div>
                    
                    {/* NEW EXPORT BUTTON UI */}
                    {readyScenes.length === scenes.length && (
                        <div style={{ marginTop: '20px', width: '100%', textAlign: 'center' }}>
                            {downloadLink ? (
                                <a 
                                    href={downloadLink} 
                                    download 
                                    style={{
                                        display: 'inline-block',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        padding: '16px 32px',
                                        borderRadius: '50px',
                                        textDecoration: 'none',
                                        fontWeight: 'bold',
                                        fontSize: '18px',
                                        boxShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.4)'
                                    }}
                                >
                                    ⬇️ Download Final .MP4
                                </a>
                            ) : (
                                <button
                                    onClick={handleExportVideo}
                                    disabled={isRenderingVideo}
                                    style={{
                                        backgroundColor: isRenderingVideo ? '#9ca3af' : '#ef4444',
                                        color: 'white',
                                        padding: '16px 32px',
                                        borderRadius: '50px',
                                        border: 'none',
                                        fontWeight: 'bold',
                                        fontSize: '18px',
                                        cursor: isRenderingVideo ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.4)'
                                    }}
                                >
                                    {isRenderingVideo ? '🔥 Rendering Final MP4 on Server...' : '💾 Export Final Video'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {scenes.map((scene) => {
                    const sceneNum = scene.scene_number;
                    const audioUrl = audioTracks[sceneNum];
                    const imageUrl = imageTracks[sceneNum];

                    return (
                        <div key={sceneNum} style={{ 
                            border: '1px solid #e5e7eb', 
                            borderRadius: '12px', 
                            overflow: 'hidden',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            backgroundColor: 'white',
                            opacity: (audioUrl && imageUrl) ? 0.6 : 1 
                        }}>
                            <div style={{ backgroundColor: '#1f2937', color: 'white', padding: '12px 20px', fontWeight: 'bold', fontSize: '18px' }}>
                                Scene {sceneNum} {audioUrl && imageUrl && '✅'}
                            </div>
                            
                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                
                                <div>
                                    <strong style={{ color: '#2563eb', display: 'block', marginBottom: '8px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        🗣️ Voiceover Narration
                                    </strong>
                                    <p style={{ margin: 0, fontSize: '20px', fontWeight: '500', color: '#111827', lineHeight: '1.4' }}>
                                        "{scene.narration_text}"
                                    </p>
                                </div>

                                <div>
                                    <strong style={{ color: '#9333ea', display: 'block', marginBottom: '8px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        ✨ AI Image Prompt
                                    </strong>
                                    <div style={{ margin: 0, backgroundColor: '#fdf4ff', border: '1px solid #f3e8ff', padding: '16px', borderRadius: '8px', fontStyle: 'italic', color: '#4c1d95', lineHeight: '1.5' }}>
                                        {scene.visual_prompt}
                                    </div>
                                </div>

                                <div style={{ 
                                    borderTop: '1px solid #f3f4f6', 
                                    paddingTop: '16px', 
                                    marginTop: '4px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px'
                                }}>
                                    {audioUrl ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#16a34a' }}>
                                                ✅ Voiceover Track Ready
                                            </span>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleGenerateAudio(sceneNum, scene.narration_text,scene.voice_type)}
                                            disabled={loadingAudio !== null || isGeneratingAll}
                                            style={{
                                                backgroundColor: (loadingAudio !== null || isGeneratingAll) ? '#9ca3af' : '#2563eb',
                                                color: 'white',
                                                border: 'none',
                                                padding: '10px 20px',
                                                borderRadius: '8px',
                                                fontSize: '14px',
                                                fontWeight: '600',
                                                cursor: (loadingAudio !== null || isGeneratingAll) ? 'not-allowed' : 'pointer',
                                                width: '100%'
                                            }}
                                        >
                                            {loadingAudio === sceneNum ? '⏳ Generating Audio...' : '🎙️ Generate Voiceover'}
                                        </button>
                                    )}

                                    {imageUrl ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#16a34a' }}>
                                                ✅ Background Visual Ready
                                            </span>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleGenerateImage(sceneNum, scene.visual_prompt)}
                                            disabled={loadingImage !== null || isGeneratingAll}
                                            style={{
                                                backgroundColor: (loadingImage !== null || isGeneratingAll) ? '#9ca3af' : '#9333ea',
                                                color: 'white',
                                                border: 'none',
                                                padding: '10px 20px',
                                                borderRadius: '8px',
                                                fontSize: '14px',
                                                fontWeight: '600',
                                                cursor: (loadingImage !== null || isGeneratingAll) ? 'not-allowed' : 'pointer',
                                                width: '100%'
                                            }}
                                        >
                                            {loadingImage === sceneNum ? '⏳ Generating Visual Art...' : '🎨 Generate Background Artwork'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}