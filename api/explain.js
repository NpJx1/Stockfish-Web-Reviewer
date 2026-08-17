// api/explain.js
// This runs securely on Vercel's Node.js backend, completely hidden from the user.

module.exports = async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { san, fen, classification } = req.body;

    // Grab the hidden key from Vercel's secure vault
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'API key is missing from Vercel settings.' });
    }

    try {
        // Send the request to Groq using the ultra-fast LLaMA 3 model
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama3-8b-8192", 
                messages: [
                    { 
                        role: "system", 
                        content: "You are an expert Grandmaster chess coach. Explain why the following move is good, bad, or a blunder based on the classification. Be concise, direct, and keep it under 3 sentences. Do not use markdown." 
                    },
                    { 
                        role: "user", 
                        content: `I just played the move ${san}. The current board FEN is ${fen}. The engine classified this move as a ${classification}. Why?` 
                    }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        
        // Send the AI's wisdom back to your frontend
        return res.status(200).json({ explanation: data.choices[0].message.content });

    } catch (error) {
        console.error("Groq API Error:", error);
        return res.status(500).json({ error: 'Failed to fetch explanation from Groq.' });
    }
}