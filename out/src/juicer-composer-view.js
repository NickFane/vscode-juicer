"use strict";

const vscode = require("vscode");

/**
 * The "Composer" prototype: a fully extension-owned webview input box that
 * hosts all the juice effects (via renderer/effects-core.js, loaded as a real
 * <script src>, not duplicated) and forwards the composed text into the real
 * Copilot Chat via the built-in `workbench.action.chat.open` command instead
 * of patching workbench.html. See docs/composer.md.
 */
class JuicerComposerViewProvider {
  constructor(context, handlers) {
    this.context = context;
    this.handlers = handlers;
    this.webviewView = null;
  }

  resolveWebviewView(webviewView, _context, _token) {
    this.webviewView = webviewView;
    const effectsScriptRoot = vscode.Uri.joinPath(this.context.extensionUri, "renderer");
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [effectsScriptRoot],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "ready":
          this.postConfig();
          break;
        case "submit":
          await this.handlers.submitToChat(message.text, false);
          break;
        case "liveSync":
          await this.handlers.submitToChat(message.text, true);
          break;
      }
    });

    this.postConfig();
  }

  refresh() {
    this.postConfig();
  }

  postConfig() {
    if (!this.webviewView) {
      return;
    }
    this.webviewView.webview.postMessage({
      type: "config",
      payload: this.handlers.getState(),
    });
  }

  getHtmlContent(webview) {
    const effectsScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "renderer", "effects-core.js")
    );

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 10px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: 12px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .title {
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .hint {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      margin-bottom: 8px;
    }
    #composerInput {
      width: 100%;
      min-height: 90px;
      box-sizing: border-box;
      resize: vertical;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 6px;
      padding: 8px;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      font-size: 13px;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
      gap: 8px;
    }
    .row-inline {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    button {
      cursor: pointer;
      border: 1px solid color-mix(in srgb, var(--vscode-focusBorder) 25%, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 7px;
      padding: 6px 12px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Juicer Composer (prototype)</div>
  </div>
  <div class="hint">
    Type here with full juice. Send forwards your text into the real Copilot Chat via
    workbench.action.chat.open - nothing is patched.
  </div>
  <textarea id="composerInput" placeholder="Type your prompt..."></textarea>
  <div class="row">
    <label class="row-inline">
      <input id="liveSyncToggle" type="checkbox" />
      Live-sync into real chat as you type (experimental)
    </label>
    <button id="sendBtn">Send</button>
  </div>

  <script src="${effectsScriptUri}"></script>
  <script>
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('composerInput');
    const sendBtn = document.getElementById('sendBtn');
    const liveSyncToggle = document.getElementById('liveSyncToggle');

    let config = null;
    let effects = null;
    let liveSyncTimer = null;
    const LIVE_SYNC_DEBOUNCE_MS = 400;

    function send(command, payload = {}) {
      vscode.postMessage({ command, ...payload });
    }

    // Classic mirror-div technique for estimating a <textarea>'s caret pixel
    // position (textareas have no native API for this). Bounded, well-known,
    // no dependency - good enough for a prototype; can be refined later.
    function getCaretCoordinates(textarea) {
      const div = document.createElement('div');
      const style = getComputedStyle(textarea);
      const props = [
        'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
        'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontSize', 'lineHeight', 'fontFamily',
        'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'whiteSpace'
      ];
      div.style.position = 'absolute';
      div.style.visibility = 'hidden';
      div.style.whiteSpace = 'pre-wrap';
      div.style.wordWrap = 'break-word';
      props.forEach((prop) => { div.style[prop] = style[prop]; });
      document.body.appendChild(div);

      const caretPos = textarea.selectionEnd;
      div.textContent = textarea.value.substring(0, caretPos);
      const span = document.createElement('span');
      span.textContent = textarea.value.substring(caretPos) || '.';
      div.appendChild(span);

      const textareaRect = textarea.getBoundingClientRect();
      const x = textareaRect.left + span.offsetLeft - textarea.scrollLeft;
      const y = textareaRect.top + span.offsetTop - textarea.scrollTop;
      document.body.removeChild(div);
      return { x, y };
    }

    function shouldCountKey(event) {
      if (!config) return false;
      if (config.ignoreKeys.includes(event.key)) return false;
      if (config.countNavigationKeys) return true;
      if (event.key.length === 1) return true;
      return ['Backspace', 'Delete', 'Enter', 'Tab'].includes(event.key);
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitCompose();
        return;
      }
      if (!effects || !shouldCountKey(event)) return;
      const anchor = getCaretCoordinates(input);
      effects.triggerKeystroke(anchor, input);
    });

    input.addEventListener('beforeinput', (event) => {
      if (!effects || !event.inputType || !event.inputType.startsWith('insert')) return;
      const typedChars = typeof event.data === 'string' && event.data.length > 0
        ? event.data.length
        : (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph' ? 1 : 0);
      effects.recordTypedChars(typedChars);
    });

    input.addEventListener('input', () => {
      if (!liveSyncToggle.checked) return;
      clearTimeout(liveSyncTimer);
      liveSyncTimer = setTimeout(() => {
        send('liveSync', { text: input.value });
      }, LIVE_SYNC_DEBOUNCE_MS);
    });

    function submitCompose() {
      const text = input.value.trim();
      if (!text) return;
      send('submit', { text });
      input.value = '';
    }

    sendBtn.addEventListener('click', submitCompose);

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.type !== 'config') return;
      // effects-core reads whatever object it was constructed with (a closure
      // over the reference), so config must stay the SAME object for the
      // page's lifetime - mutate in place, never reassign - matching the
      // existing injector's applyLiveConfig(Object.assign) pattern.
      if (!config) {
        config = {};
      }
      Object.assign(config, message.payload);
      if (!effects && window.VSJuicerEffectsCore) {
        effects = window.VSJuicerEffectsCore.createEffects(config);
        effects.injectStyles();
      }
    });

    send('ready');
  </script>
</body>
</html>`;
  }
}

module.exports = JuicerComposerViewProvider;
