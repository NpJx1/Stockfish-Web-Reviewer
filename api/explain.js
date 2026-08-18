const https = require('https');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { san, fen, classification, bestMove } = req.body;
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'API key is missing from Vercel settings.' });
    }

    const postData = JSON.stringify({
        model: "gpt-oss-120b", 
        messages: [
            { 
                role: "system", 
                content: "You are a highly observant, floating fish who is also a chess grandmaster. Explain why the user's move is good, bad, or a blunder. Rules: EXACTLY 1 or 2 short sentences. Speak casually and directly to the human. NO robotic greetings. NO filler words. Tell them the concrete chess reason. You may occasionally use a subtle ocean or fish-related pun." 
            },
            { 
                role: "user", 
                content: `I just played the move ${san}. The current board FEN is ${fen}. Stockfish classified this move as a ${classification}. Stockfish calculated that the actual best move was ${bestMove}. Why was my move bad, and why is the engine's move better?` 
            }
        ],
        temperature: 0.7
    });

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

    return new Promise((resolve) => {
        const request = https.request(options, (response) => {
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            });

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
                resolve();
            });
        });

        request.on('error', (e) => {
            console.error("Connection Error:", e);
            res.status(500).json({ error: 'Failed to connect to Groq entirely.' });
            resolve();
        });

        request.write(postData);
        request.end();
    });
};