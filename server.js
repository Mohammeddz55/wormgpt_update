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

        // إعداد السترمنج
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

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
                temperature: 0.7,
                stream: true
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            res.write(`data: ${JSON.stringify({ error: errorText })}\n\n`);
            res.end();
            return;
        }

        // قراءة السترمنج من LLMsRelay
        const reader = response.body;
        let buffer = '';

        reader.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') {
                        res.write('data: [DONE]\n\n');
                        continue;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                            res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                        }
                    } catch (e) {
                        // تجاهل الأخطاء
                    }
                }
            }
        });

        reader.on('end', () => {
            res.write('data: [DONE]\n\n');
            res.end();
        });

        reader.on('error', () => {
            res.end();
        });

    } catch (error) {
        console.error('Server error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', model: MODEL_NAME });
});

app.listen(PORT, () => {
    console.log(`WormGPT Server with streaming on ${PORT}`);
});
