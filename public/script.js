hereconst chatArea = document.getElementById('chatArea');
const welcomeScreen = document.getElementById('welcomeScreen');
const messageInput = document.getElementById('messageInput');
const btnSend = document.getElementById('btnSend');
const btnStop = document.getElementById('btnStop');
const btnThink = document.getElementById('btnThink');
const btnWebSearch = document.getElementById('btnWebSearch');
const btnNewChat = document.getElementById('btnNewChat');
const btnMenu = document.getElementById('btnMenu');
const sidebar = document.getElementById('sidebar');
const sidebarClose = document.getElementById('sidebarClose');
const overlay = document.getElementById('overlay');
const sidebarChats = document.getElementById('sidebarChats');
const sidebarSearchInput = document.getElementById('sidebarSearchInput');

let isThinking = false;
let isSearching = false;
let currentStreamElement = null;
let abortController = null;
let conversationHistory = [];

const SERVER_URL = 'https://wormgptupdate-production.up.railway.app/chat';

function addMessage(text, isUser) {
    welcomeScreen.classList.add('hidden');
    const div = document.createElement('div');
    div.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
    div.textContent = text;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
    return div;
}

function showTyping() {
    welcomeScreen.classList.add('hidden');
    const div = document.createElement('div');
    div.className = 'typing-indicator';
    div.textContent = '•••';
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
    return div;
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    addMessage(text, true);
    messageInput.value = '';
    updateComposerButtons();

    const typingElement = showTyping();
    currentStreamElement = typingElement;

    btnSend.classList.add('hidden');
    btnStop.classList.remove('hidden');

    abortController = new AbortController();

    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                showThinking: isThinking,
                clientMessageId: Date.now() + '-' + text.length
            }),
            signal: abortController.signal
        });

        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let reasoningText = '';

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
                if (data === '[DONE]') continue;

                try {
                    const json = JSON.parse(data);
                    if (json.text) {
                        fullText += json.text;
                        if (currentStreamElement.classList.contains('typing-indicator')) {
                            currentStreamElement.classList.remove('typing-indicator');
                            currentStreamElement.classList.add('message', 'ai-message');
                        }
                        currentStreamElement.textContent = fullText;
                        chatArea.scrollTop = chatArea.scrollHeight;
                    }
                    if (json.reasoning) {
                        reasoningText += json.reasoning;
                        renderThinking(currentStreamElement, reasoningText);
                    }
                } catch (e) {}
            }
        }

        // حفظ المحادثة في السايدبار
        if (fullText) {
            saveConversation(text, fullText);
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            currentStreamElement.textContent = '⚠️ خطأ في الاتصال، حاول مرة أخرى.';
        }
    } finally {
        btnSend.classList.remove('hidden');
        btnStop.classList.add('hidden');
        currentStreamElement = null;
        abortController = null;
    }
}

function renderThinking(element, reasoning) {
    let thinkingSection = element.querySelector('.thinking-section');
    if (!thinkingSection) {
        thinkingSection = document.createElement('div');
        thinkingSection.className = 'thinking-section';
        
        const header = document.createElement('div');
        header.className = 'thinking-header';
        header.innerHTML = '<span>التفكير</span><span class="thinking-toggle">^</span>';
        
        const body = document.createElement('div');
        body.className = 'thinking-body';
        
        thinkingSection.appendChild(header);
        thinkingSection.appendChild(body);
        
        header.addEventListener('click', () => {
            body.classList.toggle('visible');
            header.querySelector('.thinking-toggle').classList.toggle('open');
        });
        
        element.appendChild(thinkingSection);
    }
    
    const body = thinkingSection.querySelector('.thinking-body');
    body.textContent = reasoning;
    body.classList.add('visible');
}

function saveConversation(userMsg, aiMsg) {
    conversationHistory.push({ user: userMsg, ai: aiMsg });
    renderSidebar();
}

function renderSidebar() {
    sidebarChats.innerHTML = '';
    conversationHistory.forEach((conv, index) => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.textContent = conv.user.substring(0, 40) + (conv.user.length > 40 ? '...' : '');
        item.addEventListener('click', () => {
            loadConversation(index);
        });
        sidebarChats.appendChild(item);
    });
}

function loadConversation(index) {
    const conv = conversationHistory[index];
    if (!conv) return;
    
    chatArea.innerHTML = '';
    addMessage(conv.user, true);
    addMessage(conv.ai, false);
    closeSidebar();
}

function stopGeneration() {
    if (abortController) {
        abortController.abort();
    }
}

function updateComposerButtons() {
    const hasText = messageInput.value.trim().length > 0;
    if (hasText) {
        btnSend.classList.remove('hidden');
        btnStop.classList.add('hidden');
    } else {
        btnSend.classList.add('hidden');
        btnStop.classList.add('hidden');
    }
}

function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
}

function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
}

// Event Listeners
btnSend.addEventListener('click', sendMessage);
btnStop.addEventListener('click', stopGeneration);

btnNewChat.addEventListener('click', () => {
    chatArea.innerHTML = '';
    chatArea.appendChild(welcomeScreen);
    welcomeScreen.classList.remove('hidden');
    closeSidebar();
});

btnMenu.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

btnThink.addEventListener('click', () => {
    isThinking = !isThinking;
    btnThink.classList.toggle('active', isThinking);
});

btnWebSearch.addEventListener('click', () => {
    isSearching = !isSearching;
    btnWebSearch.classList.toggle('active', isSearching);
});

messageInput.addEventListener('input', updateComposerButtons);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sidebarSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const items = sidebarChats.querySelectorAll('.chat-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? 'block' : 'none';
    });
});
