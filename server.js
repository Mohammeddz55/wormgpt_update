const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/chat', (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message required' });
    }

    // رد تشخيصي ثابت
    res.json({
        reply: "اتصال ناجح! هذه رسالة تجريبية من السيرفر. رسالتك كانت: " + message,
        thinking: "",
        code: ""
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', model: 'test-mode' });
});

app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
});
