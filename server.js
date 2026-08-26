const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const API_URL = 'https://api.llmsrelay.com/v1/chat/completions';
const API_KEY = process.env.LLMS_RELAY_API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || 'claude-sonnet-4.6';

const SYSTEM_PROMPT = `You are WormGPT, an advanced AI assistant.
You respond in Arabic (prefer Algerian dialect when the user uses it).
You are helpful, direct, and respectful.
You provide detailed, practical answers.`;

app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message required' });

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: message }
                ],
                max_tokens: 4096,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || 'No reply';

        res.json({ reply });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', model: MODEL_NAME });
});

app.listen(PORT, () => {
    console.log(`WormGPT Server running on ${PORT}`);
});
