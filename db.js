const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS conversations (
            id SERIAL PRIMARY KEY,
            device_id TEXT NOT NULL,
            title TEXT DEFAULT 'محادثة جديدة',
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
            sender TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

async function createConversation(deviceId, title) {
    const result = await pool.query(
        'INSERT INTO conversations (device_id, title) VALUES ($1, $2) RETURNING id',
        [deviceId, title || 'محادثة جديدة']
    );
    return result.rows[0].id;
}

async function getConversations(deviceId) {
    const result = await pool.query(
        'SELECT * FROM conversations WHERE device_id = $1 ORDER BY created_at DESC',
        [deviceId]
    );
    return result.rows;
}

async function saveMessage(conversationId, sender, content) {
    await pool.query(
        'INSERT INTO messages (conversation_id, sender, content) VALUES ($1, $2, $3)',
        [conversationId, sender, content]
    );
}

async function getMessages(conversationId) {
    const result = await pool.query(
        'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
    );
    return result.rows;
}

module.exports = {
    pool,
    initDatabase,
    createConversation,
    getConversations,
    saveMessage,
    getMessages
};
