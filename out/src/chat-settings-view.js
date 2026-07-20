"use strict";

const vscode = require("vscode");

class ChatSettingsViewProvider {
  constructor(context, handlers) {
    this.context = context;
    this.handlers = handlers;
    this.webviewView = null;
  }

  resolveWebviewView(webviewView, _context, _token) {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };

    webviewView.webview.html = this.getHtmlContent();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "ready":
          this.postState();
          break;
        case "setConfig":
          await this.handlers.setConfig(message.key, message.value);
          this.postState();
          break;
        case "setEnabled":
          await this.handlers.setEnabled(Boolean(message.value));
          this.postState();
          break;
        case "applyPreset":
          await this.handlers.applyPreset(message.preset);
          this.postState();
          break;
        case "openSettings":
          await this.handlers.openSettings();
          break;
        case "resetStats":
          await this.handlers.resetStats();
          this.postState();
          break;
      }
    });

    this.postState();
  }

  refresh() {
    this.postState();
  }

  postState() {
    if (!this.webviewView) {
      return;
    }

    this.webviewView.webview.postMessage({
      type: "state",
      payload: this.handlers.getState(),
    });
  }

  getHtmlContent() {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --panel: color-mix(in srgb, var(--vscode-editor-background) 88%, white 4%);
      --panel-2: color-mix(in srgb, var(--vscode-sideBar-background) 92%, black 4%);
      --accent: var(--vscode-focusBorder);
      --muted: var(--vscode-descriptionForeground);
    }
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
      gap: 8px;
      margin-bottom: 10px;
      padding: 8px 10px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--panel), var(--panel-2));
      border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    }
    .title {
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .status-pill {
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
      background: color-mix(in srgb, var(--accent) 18%, transparent);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 10px;
    }
    .card {
      background: var(--panel);
      border-radius: 10px;
      padding: 8px;
      border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
    }
    .label {
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 4px;
    }
    .value {
      font-size: 18px;
      font-weight: 800;
      line-height: 1;
    }
    details {
      margin-bottom: 8px;
      border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
      border-radius: 10px;
      background: var(--panel);
      overflow: hidden;
    }
    summary {
      cursor: pointer;
      list-style: none;
      padding: 9px 10px;
      font-weight: 700;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 80%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--accent) 10%, transparent);
    }
    .section {
      padding: 10px;
      display: grid;
      gap: 10px;
    }
    .row {
      display: grid;
      gap: 4px;
    }
    .row-inline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    input[type="range"], select, button {
      width: 100%;
    }
    input[type="checkbox"] {
      transform: translateY(1px);
    }
    .hint {
      color: var(--muted);
      font-size: 11px;
    }
    .btn-row {
      display: flex;
      gap: 6px;
    }
    button {
      cursor: pointer;
      border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 7px;
      padding: 6px 8px;
      font-size: 12px;
    }
    button.secondary {
      background: var(--panel-2);
      color: var(--vscode-foreground);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">VSCode Juicer Control Deck</div>
    <div id="statusPill" class="status-pill">OFF</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Combo</div>
      <div id="comboValue" class="value">0</div>
    </div>
    <div class="card">
      <div class="label">WPM</div>
      <div id="wpmValue" class="value">0</div>
    </div>
  </div>

  <details open>
    <summary>Renderer Core</summary>
    <div class="section">
      <div class="row-inline">
        <div>Enable effects</div>
        <input id="enabled" type="checkbox" />
      </div>
      <div class="row">
        <label for="preset">Preset</label>
        <select id="preset">
          <option value="juicy-subtle-v1">juicy-subtle-v1</option>
          <option value="legacy">legacy</option>
          <option value="insanity">insanity</option>
        </select>
      </div>
      <div class="btn-row">
        <button id="applyPreset">Apply Preset</button>
        <button id="applyInsanity">Go Insanity</button>
        <button id="openSettings" class="secondary">Open Full Settings</button>
      </div>
    </div>
  </details>

  <details>
    <summary>Particles</summary>
    <div class="section">
      <div class="row">
        <label for="particleSize">Particle Size <span id="particleSizeValue"></span></label>
        <input id="particleSize" type="range" min="1" max="120" step="1" />
      </div>
      <div class="row">
        <label for="particlesPerKey">Particles / Key <span id="particlesPerKeyValue"></span></label>
        <input id="particlesPerKey" type="range" min="1" max="300" step="1" />
      </div>
      <div class="row">
        <label for="particleLifetime">Particle Lifetime ms <span id="particleLifetimeValue"></span></label>
        <input id="particleLifetime" type="range" min="40" max="6000" step="10" />
      </div>
    </div>
  </details>

  <details>
    <summary>Shake + Combo</summary>
    <div class="section">
      <div class="row-inline">
        <div>Shake enabled</div>
        <input id="shakeEnabled" type="checkbox" />
      </div>
      <div class="row">
        <label for="shakeDuration">Shake Duration ms <span id="shakeDurationValue"></span></label>
        <input id="shakeDuration" type="range" min="1" max="2400" step="1" />
      </div>
      <div class="row">
        <label for="shakeDistance">Shake Distance px <span id="shakeDistanceValue"></span></label>
        <input id="shakeDistance" type="range" min="1" max="120" step="1" />
      </div>
      <div class="row">
        <label for="comboThreshold">Combo Shake Threshold <span id="comboThresholdValue"></span></label>
        <input id="comboThreshold" type="range" min="1" max="300" step="1" />
      </div>
      <div id="safetyHint" class="hint"></div>
    </div>
  </details>

  <details>
    <summary>Stats</summary>
    <div class="section">
      <div class="row-inline"><span>Max Combo</span><strong id="maxCombo">0</strong></div>
      <div class="row-inline"><span>Total Typed</span><strong id="totalTyped">0</strong></div>
      <div class="row-inline"><span>Total Events</span><strong id="totalEvents">0</strong></div>
      <button id="resetStats" class="secondary">Reset Stats</button>
      <div class="hint">Live cards update while typing. Persisted totals flush in batches.</div>
    </div>
  </details>

  <script>
    const vscode = acquireVsCodeApi();

    const controls = {
      enabled: document.getElementById('enabled'),
      preset: document.getElementById('preset'),
      particleSize: document.getElementById('particleSize'),
      particlesPerKey: document.getElementById('particlesPerKey'),
      particleLifetime: document.getElementById('particleLifetime'),
      shakeEnabled: document.getElementById('shakeEnabled'),
      shakeDuration: document.getElementById('shakeDuration'),
      shakeDistance: document.getElementById('shakeDistance'),
      comboThreshold: document.getElementById('comboThreshold'),
    };

    const labels = {
      particleSize: document.getElementById('particleSizeValue'),
      particlesPerKey: document.getElementById('particlesPerKeyValue'),
      particleLifetime: document.getElementById('particleLifetimeValue'),
      shakeDuration: document.getElementById('shakeDurationValue'),
      shakeDistance: document.getElementById('shakeDistanceValue'),
      comboThreshold: document.getElementById('comboThresholdValue'),
    };

    function send(command, payload = {}) {
      vscode.postMessage({ command, ...payload });
    }

    function applyRangeProfile(preset) {
      const insanity = preset === 'insanity';
      const safetyHint = document.getElementById('safetyHint');

      if (insanity) {
        controls.particleSize.max = '200';
        controls.particlesPerKey.max = '500';
        controls.particleLifetime.max = '10000';
        controls.shakeDuration.max = '4000';
        controls.shakeDistance.max = '220';
        controls.comboThreshold.max = '500';
        safetyHint.textContent = 'Safety protocols disengaged: extreme ranges unlocked.';
      } else {
        controls.particleSize.max = '120';
        controls.particlesPerKey.max = '300';
        controls.particleLifetime.max = '6000';
        controls.shakeDuration.max = '2400';
        controls.shakeDistance.max = '120';
        controls.comboThreshold.max = '300';
        safetyHint.textContent = 'Normal limits active.';
      }
    }

    function bindRange(id, settingKey) {
      controls[id].addEventListener('input', () => {
        labels[id].textContent = controls[id].value;
      });
      controls[id].addEventListener('change', () => {
        send('setConfig', { key: settingKey, value: Number(controls[id].value) });
      });
    }

    controls.enabled.addEventListener('change', () => {
      send('setEnabled', { value: controls.enabled.checked });
    });

    controls.preset.addEventListener('change', () => {
      applyRangeProfile(controls.preset.value);
      send('applyPreset', { preset: controls.preset.value });
    });

    bindRange('particleSize', 'particleSizePx');
    bindRange('particlesPerKey', 'particlesPerKeystroke');
    bindRange('particleLifetime', 'particleLifetimeMs');
    bindRange('shakeDuration', 'shakeDurationMs');
    bindRange('shakeDistance', 'shakeDistancePx');
    bindRange('comboThreshold', 'comboShakeThreshold');

    controls.shakeEnabled.addEventListener('change', () => {
      send('setConfig', { key: 'shakeEnabled', value: controls.shakeEnabled.checked });
    });

    document.getElementById('applyPreset').addEventListener('click', () => {
      applyRangeProfile(controls.preset.value);
      send('applyPreset', { preset: controls.preset.value });
    });
    document.getElementById('applyInsanity').addEventListener('click', () => {
      controls.preset.value = 'insanity';
      applyRangeProfile('insanity');
      send('applyPreset', { preset: 'insanity' });
    });
    document.getElementById('openSettings').addEventListener('click', () => send('openSettings'));
    document.getElementById('resetStats').addEventListener('click', () => send('resetStats'));

    function render(state) {
      const settings = state.settings;
      const stats = state.stats;

      document.getElementById('statusPill').textContent = settings.enabled ? 'ON' : 'OFF';
      controls.enabled.checked = settings.enabled;
      controls.preset.value = settings.preset;
      applyRangeProfile(settings.preset);

      controls.particleSize.value = settings.particleSizePx;
      controls.particlesPerKey.value = settings.particlesPerKeystroke;
      controls.particleLifetime.value = settings.particleLifetimeMs;
      controls.shakeEnabled.checked = settings.shakeEnabled;
      controls.shakeDuration.value = settings.shakeDurationMs;
      controls.shakeDistance.value = settings.shakeDistancePx;
      controls.comboThreshold.value = settings.comboShakeThreshold;

      labels.particleSize.textContent = settings.particleSizePx;
      labels.particlesPerKey.textContent = settings.particlesPerKeystroke;
      labels.particleLifetime.textContent = settings.particleLifetimeMs;
      labels.shakeDuration.textContent = settings.shakeDurationMs;
      labels.shakeDistance.textContent = settings.shakeDistancePx;
      labels.comboThreshold.textContent = settings.comboShakeThreshold;

      document.getElementById('comboValue').textContent = stats.combo;
      document.getElementById('wpmValue').textContent = stats.wpm;
      document.getElementById('maxCombo').textContent = stats.maxCombo;
      document.getElementById('totalTyped').textContent = stats.totalTyped;
      document.getElementById('totalEvents').textContent = stats.totalEvents;
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message && message.type === 'state') {
        render(message.payload);
      }
    });

    send('ready');
    setInterval(() => send('ready'), 700);
  </script>
</body>
</html>`;
  }
}

module.exports = ChatSettingsViewProvider;
