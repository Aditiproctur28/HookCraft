import React, { useState } from 'react';

export default function ScriptInput({ onScriptGenerated }) {
    const [topic, setTopic] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!topic.trim()) return;

        setIsLoading(true);
        setError('');

        try {
            // Call the local Node.js backend server we created earlier
            const response = await fetch('http://localhost:3001/api/scripts/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ topic }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Something went wrong');
            }

            // Send the beautiful JSON data back up to the main App component
            onScriptGenerated(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
            <h2>Create a New Script Hook</h2>
            <form onSubmit={handleSubmit}>
                <textarea
                    rows="4"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Explain why active listening is vital for team communication in a 10-second vertical format..."
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #ccc',
                        fontSize: '16px',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                    }}
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    disabled={isLoading || !topic.trim()}
                    style={{
                        marginTop: '12px',
                        width: '100%',
                        padding: '12px',
                        backgroundColor: isLoading ? '#ccc' : '#0070f3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '16px',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    {isLoading ? 'AI is crafting your script...' : 'Generate Script & Storyboard'}
                </button>
            </form>

            {error && (
                <div style={{ marginTop: '15px', color: 'red', backgroundColor: '#fee2e2', padding: '10px', borderRadius: '6px' }}>
                    <strong>Error:</strong> {error}
                </div>
            )}
        </div>
    );
}