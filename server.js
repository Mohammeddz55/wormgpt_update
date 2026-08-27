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

// تخزين المهام مؤقتًا (نستبدله لاحقًا بقاعدة بيانات)
const jobs = new Map();

const SYSTEM_PROMPT = `أنت WormGPT، مساعد ذكي. ترد بالعربية، وتميل للدارجة إذا كتب المستخدم بها. تشرح خطوات تفكيرك فقط إذا طُلب منك.`;

app.post('/chat', async (req, res) => {
    const t0 = Date.now();
    console.log('requestReceivedByServer');
    try {
        const { message, showThinking = false, clientMessageId } = req.body;
        if (!message) return res.status(400).json({ error: 'Message required' });

        // منع تكرار نفس الرسالة
        if (jobs.has(clientMessageId)) {
            return res.json({ job_id: jobs.get(clientMessageId).job_id, status: 'duplicate' });
        }

        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        jobs.set(jobId, { job_id: jobId, status: 'processing', message, created_at: t0 });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        console.log('aiRequestStart', Date.now() - t0);

        const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
        if (showThinking) messages.push({ role: 'system', content: 'اشرح خطوات التفكير قبل الإجابة.' });
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

        console.log('aiHeadersReceived', Date.now() - t0);

        if (!response.ok) {
            const err = await response.text();
            console.log('aiError', err, Date.now() - t0);
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
                    console.log('lastTokenReceived', Date.now() - t0);
                    jobs.set(jobId, { ...jobs.get(jobId), status: 'completed' });
                    res.write(`data: ${JSON.stringify({ done: true, job_id: jobId })}\n\n`);
                    continue;
                }
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        res.write(`data: ${JSON.stringify({ text: delta, job_id: jobId })}\n\n`);
                    }
                } catch {}
            }
        }

        console.log('responseSentToApp', Date.now() - t0);
        res.end();
    } catch (e) {
        console.error('serverError', e.message, Date.now() - t0);
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
    }
});

app.get('/job/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`WormGPT server on ${PORT}`));
