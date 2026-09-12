/**
 * ChatWindow.js — Reusable chat UI component.
 *
 * Extracts the identical chat window markup, auto-scroll behavior,
 * message bubbles, and input handling from the 3 chat screens.
 */

import { exportToMarkdown } from '../services/exportService.js';

const { h } = window.preact;
const { useState, useEffect } = window.preactHooks;
const html = window.htm.bind(h);

/**
 * @param {object} props
 * @param {Array<{ role: string, content: string }>} props.messages - Chat message history
 * @param {boolean} props.loading - Whether a response is being generated
 * @param {string} props.userInput - Current input text
 * @param {function} props.onSend - Called when user submits a message
 * @param {function} props.onInputChange - Called with new input string
 * @param {function} props.onClear - Called when user clicks Clear
 * @param {number|null} props.status - HTTP status code from last response
 * @param {string|null} props.error - Error message to display
 * @param {boolean} [props.disabled] - Disable input (e.g. no model selected)
 * @param {string} [props.emptyIcon] - Icon for empty state (default '💬')
 * @param {string} [props.emptyText] - Text for empty state
 * @param {string} [props.loadingText] - Loading indicator text (default 'Thinking...')
 */
export default function ChatWindow({
  messages = [],
  loading = false,
  userInput = '',
  onSend,
  onInputChange,
  onClear,
  status = null,
  error = null,
  disabled = false,
  emptyIcon = '💬',
  emptyText = 'Start a conversation...',
  loadingText = 'Thinking...'
}) {
  const [exportError, setExportError] = useState(null);

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    const chatWin = document.getElementById('chat-window');
    if (chatWin) {
      chatWin.scrollTop = chatWin.scrollHeight;
    }
  }, [messages, loading]);

  async function handleExport(content) {
    try {
      setExportError(null);
      await exportToMarkdown(content);
    } catch (err) {
      setExportError(`Export failed: ${err.message}`);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  const displayError = error || exportError;

  return html`
    <div class="card shadow-sm mb-4 border-0" style="height: 500px; display: flex; flex-direction: column;">
      <div class="card-header bg-light d-flex justify-content-between align-items-center">
        <div class="d-flex align-items-center gap-2">
          <h5 class="mb-0">Chat</h5>
          ${status ? html`<span class="badge ${status === 200 ? 'bg-success' : 'bg-danger'}">HTTP ${status}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-outline-danger" onclick=${onClear} disabled=${loading}>
          Clear
        </button>
      </div>
      
      <div class="card-body overflow-auto p-3" id="chat-window" style="flex-grow: 1; background-color: #f8f9fa;">
        ${messages.length === 0 ? html`
          <div class="h-100 d-flex flex-column justify-content-center align-items-center text-muted">
            <span style="font-size: 3rem;">${emptyIcon}</span>
            <p>${emptyText}</p>
          </div>
        ` : messages.map(msg => html`
          <div class="mb-3 d-flex flex-column ${msg.role === 'user' ? 'align-items-end' : 'align-items-start'}">
            <div style="max-width: 80%; padding: 10px 15px; border-radius: 12px; 
                        background: ${msg.role === 'user' ? '#007bff' : '#e9ecef'};
                        color: ${msg.role === 'user' ? 'white' : '#000'};">
              <div style="white-space: pre-wrap; word-wrap: break-word; line-height: 1.4;">
                ${msg.content}
              </div>
            </div>
            ${msg.role !== 'user' ? html`
              <div class="mt-1 ms-2">
                <a href="#" class="text-decoration-none small text-muted" 
                   onclick=${(e) => { e.preventDefault(); handleExport(msg.content); }}>
                  export to markdown
                </a>
              </div>
            ` : ''}
          </div>
        `)}
        ${loading ? html`
          <div class="mb-3 d-flex justify-content-start">
            <div style="padding: 10px 15px; border-radius: 12px; background: #e9ecef;">
              <span class="spinner-border spinner-border-sm text-primary"></span>
              <span class="ms-2">${loadingText}</span>
            </div>
          </div>
        ` : ''}
      </div>

      <div class="card-footer bg-white border-top p-3">
        <div class="input-group">
          <textarea class="form-control" placeholder="Type your message..." rows="1"
                    style="resize: none;"
                    value=${userInput}
                    oninput=${(e) => onInputChange(e.target.value)}
                    onkeydown=${handleKeyDown}
                    disabled=${loading || disabled}></textarea>
          <button class="btn btn-primary" onclick=${onSend}
                  disabled=${loading || !userInput.trim() || disabled}>
            Send
          </button>
        </div>
        ${displayError ? html`<div class="alert alert-danger mt-2 mb-0 py-2 px-3">${displayError}</div>` : ''}
      </div>
    </div>
  `;
}
