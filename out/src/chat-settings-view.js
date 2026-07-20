"use strict";

const vscode = require("vscode");
const { CATEGORIES, FIELDS } = require("./chat-settings-fields");

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
    const categoriesJson = JSON.stringify(CATEGORIES);
    const fieldsJson = JSON.stringify(FIELDS);

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
      --danger: var(--vscode-terminal-ansiRed, #ff6b6b);
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
    .row-inline.dangerous {
      color: var(--danger);
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
    .stepper-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .stepper-group {
      display: flex;
      gap: 3px;
      flex-shrink: 0;
    }
    .stepper-group button {
      width: auto;
      padding: 2px 6px;
      font-size: 10px;
      line-height: 1.4;
    }
    .field-label {
      flex: 1;
      text-align: center;
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .field-value {
      color: var(--vscode-foreground);
      font-weight: 700;
    }
    .array-preview {
      color: var(--muted);
      font-size: 11px;
      word-break: break-word;
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

  <div id="categories"></div>

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
    const CATEGORIES = ${categoriesJson};
    const FIELDS = ${fieldsJson};

    // Duplicated verbatim from out/src/chat-settings-fields.js (the webview has no
    // module system, same constraint as renderer/vscode-juicer-injector.js) - keep
    // both copies in sync if the step-math formula changes.
    function niceStep(raw) {
      if (raw <= 1) return 1;
      const pow = Math.pow(10, Math.floor(Math.log10(raw)));
      const norm = raw / pow;
      let niceNorm;
      if (norm < 1.5) niceNorm = 1;
      else if (norm < 3) niceNorm = 2;
      else if (norm < 7) niceNorm = 5;
      else niceNorm = 10;
      return Math.max(1, Math.round(niceNorm * pow));
    }
    function deriveSteps(min, max) {
      const range = Math.max(1, max - min);
      const base = niceStep(range * 0.01);
      return { base, ladder: [base, base * 2, base * 4] };
    }
    function clampValue(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function send(command, payload = {}) {
      vscode.postMessage({ command, ...payload });
    }

    function activeMax(field, presetName) {
      return presetName === 'insanity' && field.insanityMax !== undefined ? field.insanityMax : field.max;
    }

    // key -> { el, valueEl?, steppersEl? } for every rendered field.
    const fieldEls = {};

    function buildNumberRow(field) {
      const row = document.createElement('div');
      row.className = 'row';

      const stepperRow = document.createElement('div');
      stepperRow.className = 'stepper-row';

      const left = document.createElement('div');
      left.className = 'stepper-group';
      const right = document.createElement('div');
      right.className = 'stepper-group';

      const label = document.createElement('div');
      label.className = 'field-label';
      label.innerHTML = field.label + ' <span class="field-value"></span>';

      stepperRow.append(left, label, right);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(field.min);
      slider.step = '1';

      row.append(stepperRow, slider);

      const valueEl = label.querySelector('.field-value');

      function currentPresetName() {
        const presetField = fieldEls.preset;
        return presetField && presetField.el ? presetField.el.value : 'juicy-subtle-v1';
      }

      function setValue(next, notify) {
        const max = activeMax(field, currentPresetName());
        const clamped = clampValue(Math.round(next), field.min, max);
        slider.value = String(clamped);
        valueEl.textContent = String(clamped);
        if (notify) {
          send('setConfig', { key: field.key, value: clamped });
        }
      }

      function rebuildSteppers() {
        const max = activeMax(field, currentPresetName());
        slider.max = String(max);
        const { ladder } = deriveSteps(field.min, max);
        left.innerHTML = '';
        right.innerHTML = '';
        // Left reads largest-to-smallest magnitude outward-in: -4 -2 -1 | slider | +1 +2 +4
        [...ladder].reverse().forEach((delta) => {
          const btn = document.createElement('button');
          btn.className = 'secondary';
          btn.textContent = '-' + delta;
          btn.addEventListener('click', () => setValue(Number(slider.value) - delta, true));
          left.appendChild(btn);
        });
        ladder.forEach((delta) => {
          const btn = document.createElement('button');
          btn.className = 'secondary';
          btn.textContent = '+' + delta;
          btn.addEventListener('click', () => setValue(Number(slider.value) + delta, true));
          right.appendChild(btn);
        });
      }

      slider.addEventListener('input', () => {
        valueEl.textContent = slider.value;
      });
      slider.addEventListener('change', () => {
        send('setConfig', { key: field.key, value: Number(slider.value) });
      });

      fieldEls[field.key] = { el: slider, valueEl, rebuildSteppers, setValue };
      return row;
    }

    function buildBooleanRow(field) {
      const row = document.createElement('div');
      row.className = 'row-inline' + (field.dangerous ? ' dangerous' : '');

      const label = document.createElement('div');
      label.textContent = field.label;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => {
        send('setConfig', { key: field.key, value: input.checked });
      });

      row.append(label, input);
      fieldEls[field.key] = { el: input };

      if (field.hint) {
        const wrap = document.createElement('div');
        const hint = document.createElement('div');
        hint.className = 'hint';
        hint.textContent = field.hint;
        wrap.append(row, hint);
        return wrap;
      }
      return row;
    }

    function buildEnumRow(field) {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('label');
      label.textContent = field.label;
      const select = document.createElement('select');
      field.options.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        if (field.key === 'preset') {
          applyPresetRangeSwitch();
          send('applyPreset', { preset: select.value });
        } else {
          send('setConfig', { key: field.key, value: select.value });
        }
      });
      row.append(label, select);
      fieldEls[field.key] = { el: select };
      return row;
    }

    function buildArrayReadonlyRow(field) {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('div');
      label.className = 'field-label';
      label.style.textAlign = 'left';
      label.textContent = field.label;
      const preview = document.createElement('div');
      preview.className = 'array-preview';
      row.append(label, preview);
      fieldEls[field.key] = { previewEl: preview };
      return row;
    }

    function buildFieldRow(field) {
      if (field.type === 'number') return buildNumberRow(field);
      if (field.type === 'boolean') return buildBooleanRow(field);
      if (field.type === 'enum') return buildEnumRow(field);
      if (field.type === 'array-readonly') return buildArrayReadonlyRow(field);
      return document.createElement('div');
    }

    function applyPresetRangeSwitch() {
      Object.keys(fieldEls).forEach((key) => {
        const entry = fieldEls[key];
        if (entry.rebuildSteppers) {
          const oldValue = Number(entry.el.value);
          entry.rebuildSteppers();
          entry.setValue(oldValue, false);
        }
      });
    }

    function renderCategories() {
      const root = document.getElementById('categories');
      CATEGORIES.forEach((category) => {
        const fields = FIELDS.filter((f) => f.category === category.id);
        if (fields.length === 0) return;

        const details = document.createElement('details');
        if (category.id === 'core') details.open = true;
        const summary = document.createElement('summary');
        summary.textContent = category.title;
        const section = document.createElement('div');
        section.className = 'section';

        fields.forEach((field) => section.appendChild(buildFieldRow(field)));

        if (category.id === 'core') {
          const btnRow = document.createElement('div');
          btnRow.className = 'btn-row';
          const applyBtn = document.createElement('button');
          applyBtn.textContent = 'Apply Preset';
          applyBtn.addEventListener('click', () => {
            applyPresetRangeSwitch();
            send('applyPreset', { preset: fieldEls.preset.el.value });
          });
          const insanityBtn = document.createElement('button');
          insanityBtn.textContent = 'Go Insanity';
          insanityBtn.addEventListener('click', () => {
            fieldEls.preset.el.value = 'insanity';
            applyPresetRangeSwitch();
            send('applyPreset', { preset: 'insanity' });
          });
          const settingsBtn = document.createElement('button');
          settingsBtn.className = 'secondary';
          settingsBtn.textContent = 'Open Full Settings';
          settingsBtn.addEventListener('click', () => send('openSettings'));
          btnRow.append(applyBtn, insanityBtn, settingsBtn);
          section.appendChild(btnRow);
        }

        if (category.id === 'input') {
          const hint = document.createElement('div');
          hint.className = 'hint';
          hint.textContent = 'Arrays are edited via Open Full Settings above.';
          section.appendChild(hint);
        }

        details.append(summary, section);
        root.appendChild(details);
      });
    }

    document.getElementById('resetStats').addEventListener('click', () => send('resetStats'));

    function render(state) {
      const settings = state.settings;
      const stats = state.stats;

      document.getElementById('statusPill').textContent = settings.enabled ? 'ON' : 'OFF';

      FIELDS.forEach((field) => {
        const entry = fieldEls[field.key];
        if (!entry) return;
        const value = settings[field.key];

        if (field.type === 'number') {
          entry.rebuildSteppers();
          entry.setValue(value, false);
        } else if (field.type === 'boolean') {
          entry.el.checked = Boolean(value);
        } else if (field.type === 'enum') {
          entry.el.value = value;
        } else if (field.type === 'array-readonly') {
          entry.previewEl.textContent = Array.isArray(value) ? value.join(', ') : String(value);
        }
      });

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

    renderCategories();
    send('ready');
    setInterval(() => send('ready'), 700);
  </script>
</body>
</html>`;
  }
}

module.exports = ChatSettingsViewProvider;
