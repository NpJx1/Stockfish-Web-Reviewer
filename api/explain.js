// api/explain.js
// Powered by Node's native HTTPS module. Immune to 'fetch' errors and caching issues.

const https = require('https');

module.exports = async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { san, fen, classification } = req.body;
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'API key is missing from Vercel settings.' });
    }

    // The data we are sending to Groq
    const postData = JSON.stringify({
        model: "openai/gpt-oss-120b",

        messages: [
            { 
                role: "system", 
                content: "You are a highly observant, slightly sleepy cat who is also a chess grandmaster. Explain why the user's move is good, bad, or a blunder. Rules: EXACTLY 1 or 2 short sentences. Speak casually and directly to the human. NO robotic greetings. NO filler words. Tell them the concrete chess reason (e.g. 'You hung your knight' or 'That forks the king and rook. Nice.')." 
            },
            { 
                role: "user", 
                content: `Move: ${san}. FEN: ${fen}. Engine classification: ${classification}. Why?` 
            }
        ],
        temperature: 0.7
    });

    // The exact routing instructions to reach Groq's servers
    const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    // Wrap the old-school HTTPS request in a modern Promise so Vercel waits for it
    return new Promise((resolve) => {
        const request = https.request(options, (response) => {
            let data = '';

            // As Groq streams the response back, combine the chunks
            response.on('data', (chunk) => {
                data += chunk;
            });

            // When Groq is totally finished talking
            response.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    if (response.statusCode === 200) {
                        res.status(200).json({ explanation: parsedData.choices[0].message.content });
                    } else {
                        res.status(500).json({ error: parsedData.error?.message || 'API rejected the request.' });
                    }
                } catch (error) {
                    res.status(500).json({ error: 'Failed to read Groq API response.' });
                }
                resolve(); // Signal to Vercel that the serverless function is complete
            });
        });

        // If the connection drops completely
        request.on('error', (e) => {
            console.error("Connection Error:", e);
            res.status(500).json({ error: 'Failed to connect to Groq entirely.' });
            resolve();
        });

        // Fire the request!
        request.write(postData);
        request.end();
    });
};