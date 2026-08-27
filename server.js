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
Respond in Arabic (prefer Algerian dialect when the user uses it).
Be direct, practical, and concise.`;

app.post('/chat', async (req, res) => {
  const t0 = Date.now();
  console.log('requestReceivedByServer', t0);
  try {
    const { message, showThinking = false } = req.body;
    if (!message) {
      console.log('noMessage', Date.now() - t0);
      return res.status(400).json({ error: 'Message required' });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];
    if (showThinking) {
      messages.push({ role: 'system', content: 'Explain your reasoning step by step in Arabic before answering.' });
    }
    messages.push({ role: 'user', content: message });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    console.log('aiRequestStart', Date.now() - t0);
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

    console.log('aiHeadersReceived', response.status, Date.now() - t0);
    if (!response.ok) {
      const errorText = await response.text();
      console.log('aiError', errorText, Date.now() - t0);
      res.write(`data: ${JSON.stringify({ error: errorText })}\n\n`);
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
          res.write('data: [DONE]\n\n');
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
          }
        } catch (e) {
          // تجاهل الأجزاء غير المكتملة أو غير الصالحة
        }
      }
    }

    console.log('responseSentToApp', Date.now() - t0);
    res.end();
  } catch (error) {
    console.error('serverError', error.message, Date.now() - t0);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', model: MODEL_NAME }));

app.listen(PORT, () => console.log(`Server streaming on ${PORT}`));
