const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const API_URL = 'https://api.llmsrelay.com/v1/chat/completions';
const API_KEY = process.env.LLMS_RELAY_API_KEY;
const MODEL_NAME = process.env.MODEL_NAME || 'claude-sonnet-4.6';

const jobs = new Map();
const messageLocks = new Map();

const SYSTEM_PROMPT = `أنت WormGPT، مساعد ذكي متقدم. ترد بالعربية، وتميل للدارجة الجزائرية إذا كتب المستخدم بها.`;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/chat', async (req, res) => {
    const t0 = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    console.log(`[${requestId}] requestStarted`);

    try {
        const { message, showThinking = false, clientMessageId } = req.body;
        if (!message) return res.status(400).json({ error: 'Message required' });

        if (clientMessageId && messageLocks.has(clientMessageId)) {
            return res.json({ job_id: messageLocks.get(clientMessageId), status: 'duplicate' });
        }

        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        if (clientMessageId) messageLocks.set(clientMessageId, jobId);
        jobs.set(jobId, { job_id: jobId, status: 'processing', message, created_at: t0 });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        console.log(`[${requestId}] aiRequestStarted ${Date.now() - t0}ms`);

        const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
        if (showThinking) {
            messages.push({ role: 'system', content: 'قدم تفكيرًا داخليًا حقيقيًا ثم الإجابة النهائية بعد فاصل واضح: "---"' });
        }
        messages.push({ role: 'user', content: message });

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages,
                max_tokens: showThinking ? 4096 : 2048,
                temperature: 0.7,
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.text();
            jobs.set(jobId, { ...jobs.get(jobId), status: 'failed', error: err });
            res.write(`data: ${JSON.stringify({ error: err, job_id: jobId })}\n\n`);
            res.end();
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') {
                    jobs.set(jobId, { ...jobs.get(jobId), status: 'completed' });
                    res.write(`data: ${JSON.stringify({ type: 'done', job_id: jobId })}\n\n`);
                    continue;
                }
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta;
                    const text = delta?.content || '';
                    const reasoning = delta?.reasoning_content || delta?.reasoning || '';

                    if (reasoning) {
                        res.write(`data: ${JSON.stringify({ type: 'reasoning', text: reasoning, job_id: jobId })}\n\n`);
                    }
                    if (text) {
                        res.write(`data: ${JSON.stringify({ type: 'content', text, job_id: jobId })}\n\n`);
                    }
                } catch {}
            }
        }

        res.end();
    } catch (error) {
        console.error(`[${requestId}] serverError ${error.message}`);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.get('/job/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

app.get('/health', (req, res) => res.json({ status: 'ok', model: MODEL_NAME }));

app.listen(PORT, () => console.log(`WormGPT server running on ${PORT}`));
