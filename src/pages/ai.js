/**
 * ai.js — AI Study Assistant
 *
 * A bounded, context-aware chat assistant backed by the app's own
 * FastAPI endpoint (POST /api/ai/chat). The browser NEVER talks to
 * OpenRouter directly — the API key stays server-side.
 *
 * - Chat history is held in memory only (never persisted), capped at 20.
 * - The backend enriches the request with a bounded snapshot of the
 *   student's real data (tasks, subjects, sessions, notes, analytics)
 *   based on the detected intent of each message.
 * - Loading + error states are rendered inline so failures are friendly.
 */

import { icons } from '../icons.js';
import { apiClient } from '../services/apiClient.js';
import { showErrorToast } from '../services/notify.js';

const HISTORY_LIMIT = 20;
const SEND_TIMEOUT_MS = 45000;

const STARTER_PROMPTS = [
  { label: 'What should I study today?', icon: 'target' },
  { label: 'What tasks should I prioritize?', icon: 'tasks' },
  { label: 'Make me a 2-hour study plan.', icon: 'clock' },
  { label: 'How am I progressing?', icon: 'activity' },
  { label: 'Help me revise a subject.', icon: 'brain' },
];

export function AIPage() {
  const container = document.createElement('div');
  container.className = 'page-content ai-page';

  const state = {
    messages: [],   // [{ role: 'user'|'assistant', content }]
    sending: false,
    error: null,
  };

  function currentHistory() {
    return state.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  /* ───────────────────────── Render helpers ───────────────────────── */

  function renderWelcome() {
    return `
      <div class="chat-welcome">
        <div class="chat-welcome-avatar">${icons.ai(28)}</div>
        <h3>Hi, I'm your study assistant</h3>
        <p>Ask about what to study, which tasks to prioritize, or how you're
        progressing. I can only see what's actually in your dashboard.</p>
        <div class="chat-starter-grid">
          ${STARTER_PROMPTS.map((p) => `
            <button class="chat-starter-chip" data-starter="${escapeHtml(p.label)}">
              ${icons[p.icon](15)} ${escapeHtml(p.label)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderMessage(msg) {
    if (msg.role === 'user') {
      return `
        <div class="chat-msg chat-msg-user">
          <div class="chat-msg-bubble chat-msg-bubble-user">${escapeHtml(msg.content)}</div>
        </div>
      `;
    }
    return `
      <div class="chat-msg chat-msg-ai">
        <div class="chat-msg-avatar">${icons.ai(15)}</div>
        <div class="chat-msg-bubble chat-msg-bubble-ai">${escapeHtml(msg.content)}</div>
      </div>
    `;
  }

  function renderTyping() {
    return `
      <div class="chat-msg chat-msg-ai">
        <div class="chat-msg-avatar">${icons.ai(15)}</div>
        <div class="chat-msg-bubble chat-msg-bubble-ai chat-typing" aria-label="Assistant is typing">
          <span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span>
        </div>
      </div>
    `;
  }

  function renderError() {
    return `
      <div class="chat-msg chat-msg-ai">
        <div class="chat-msg-avatar">${icons.ai(15)}</div>
        <div class="chat-msg-bubble chat-msg-bubble-ai chat-error-bubble">
          <div class="chat-error-title">Couldn't reach the assistant</div>
          <div class="chat-error-text">${escapeHtml(state.error)}</div>
        </div>
      </div>
    `;
  }

  function render() {
    const hasConversation = state.messages.length > 0;

    container.innerHTML = `
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-header-text">
          <h2>AI Study Assistant</h2>
          <p>A practical companion grounded in your real tasks, subjects, sessions & notes</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-ghost btn-sm" id="clearChatBtn" ${hasConversation ? '' : 'disabled'}>
            ${icons.x(14)} Clear conversation
          </button>
        </div>
      </div>

      <div class="chat-shell">
        <div class="chat-messages" id="chatMessages" aria-live="polite">
          ${hasConversation
            ? state.messages.map(renderMessage).join('')
            : renderWelcome()}
          ${state.sending ? renderTyping() : ''}
          ${state.error && !state.sending ? renderError() : ''}
        </div>

        <div class="chat-composer">
          <textarea
            id="chatInput"
            class="chat-input"
            rows="1"
            placeholder="Ask about your studies…  (Enter to send, Shift+Enter for a new line)"
            aria-label="Message the AI study assistant"
          ></textarea>
          <button class="chat-send-btn" id="chatSendBtn" aria-label="Send message" title="Send message" ${state.sending ? 'disabled' : ''}>
            ${icons.arrowUp(18)}
          </button>
        </div>
      </div>
    `;

    bindEvents();
    scrollToBottom();
    container.querySelector('#chatInput')?.focus();
  }

  /* ───────────────────────── Actions ───────────────────────── */

  async function sendMessage(text) {
    const message = (text ?? '').trim();
    if (!message || state.sending) return;

    state.messages.push({ role: 'user', content: message });
    state.error = null;
    state.sending = true;
    render();

    try {
      const data = await apiClient.post(
        '/ai/chat',
        { message, history: currentHistory() },
        { timeout: SEND_TIMEOUT_MS },
      );
      if (data && typeof data.message === 'string') {
        state.messages.push({ role: 'assistant', content: data.message });
      }
    } catch (err) {
      state.error = (err && err.message) || 'AI assistant is temporarily unavailable. Please try again.';
      showErrorToast(err);
    } finally {
      state.sending = false;
      render();
    }
  }

  function clearConversation() {
    state.messages = [];
    state.error = null;
    state.sending = false;
    render();
  }

  /* ───────────────────────── Events ───────────────────────── */

  function bindEvents() {
    const input = container.querySelector('#chatInput');
    const sendBtn = container.querySelector('#chatSendBtn');
    const clearBtn = container.querySelector('#clearChatBtn');
    const messagesEl = container.querySelector('#chatMessages');

    function submit() {
      const value = input ? input.value : '';
      if (input) input.value = '';
      sendMessage(value);
    }

    sendBtn?.addEventListener('click', submit);

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });

    input?.addEventListener('input', () => {
      if (!input) return;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    });

    clearBtn?.addEventListener('click', clearConversation);

    // Starter prompt chips
    messagesEl?.querySelectorAll('.chat-starter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        sendMessage(chip.dataset.starter);
      });
    });
  }

  function scrollToBottom() {
    const messagesEl = container.querySelector('#chatMessages');
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Initial render
  render();

  container._destroy = () => {
    state.messages = [];
    state.error = null;
    state.sending = false;
  };

  return container;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}