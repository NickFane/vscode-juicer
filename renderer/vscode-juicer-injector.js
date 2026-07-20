/**
 * Renderer-side VSCode Juicer companion.
 *
 * This file is injected into the VS Code workbench by the extension.
 * It exists because the extension host can only observe real text document
 * changes, while Copilot Chat input lives inside a renderer/webview surface.
 */

(function () {
  'use strict';

  if (window.__vscodeJuicerInjectorLoaded) {
    return;
  }
  window.__vscodeJuicerInjectorLoaded = true;

  const DEFAULT_CONFIG = {
    comboDecayMs: 1500,
    comboShakeThreshold: 15,
    particlesPerKeystroke: 5,
    particleLifetimeMs: 260,
    particleSizePx: 4,
    particleDistanceMin: 6,
    particleDistanceMax: 16,
    particleOffsetX: 5,
    particleOffsetY: 0,
    particleSaturation: 90,
    particleLightness: 60,
    particleFollowTextColor: true,
    shakeEnabled: true,
    shakeDurationMs: 34,
    shakeDistancePx: 1,
    shakeLoop: false,
    hitCounterEnabled: true,
    hitCounterLifetimeMs: 520,
    hitCounterOffsetX: 16,
    hitCounterOffsetY: -16,
    countNavigationKeys: true,
    anchorMode: 'caret-or-pointer',
    targetSelectors: [
      '.monaco-editor',
      '.interactive-session',
      '.interactive-input-part',
      '.interactive-input-editor',
    ],
    ignoreKeys: ['Shift', 'Control', 'Alt', 'Meta'],
  };

  function parseStoredConfig() {
    try {
      const raw = window.localStorage.getItem('vscodeJuicerConfig');
      return raw ? JSON.parse(raw) : {};
    } catch (_error) {
      return {};
    }
  }

  const runtimeConfig = window.__vscodeJuicerConfig || {};
  const storedConfig = parseStoredConfig();
  const config = {
    ...DEFAULT_CONFIG,
    ...storedConfig,
    ...runtimeConfig,
  };

  let safetyOff = !!config.safetyOff;

  let particleDistanceRange = Math.max(
    0,
    config.particleDistanceMax - config.particleDistanceMin
  );

  function applyLiveConfig(newCfg) {
    if (!newCfg || typeof newCfg !== 'object') return;
    Object.assign(config, newCfg);
    safetyOff = !!config.safetyOff;
    particleDistanceRange = Math.max(0, config.particleDistanceMax - config.particleDistanceMin);
    const root = document.documentElement;
    if (root) {
      root.style.setProperty('--pm-shake-duration', `${config.shakeDurationMs}ms`);
      root.style.setProperty('--pm-shake-distance', `${config.shakeDistancePx}px`);
      root.style.setProperty('--pm-particle-lifetime', `${config.particleLifetimeMs}ms`);
      root.style.setProperty('--pm-shake-loop', config.shakeLoop ? 'infinite' : '1');
    }
  }

  function startLiveConfigPolling() {
    const configPath = window.__vscodeJuicerConfigPath;
    if (!configPath) return;
    let lastContent = '';
    setInterval(() => {
      try {
        // eslint-disable-next-line no-undef
        const fs = require('fs');
        const content = fs.readFileSync(configPath, 'utf8');
        if (content !== lastContent) {
          lastContent = content;
          applyLiveConfig(JSON.parse(content));
        }
      } catch (_e) {
        // fs unavailable or file missing — silently ignore
      }
    }, 500);
  }

  let combo = 0;
  let comboResetTimer = null;
  let hitCounterElement = null;
  let hitCounterHideTimer = null;
  let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let recentTypedChars = [];
  let currentWpm = 0;
  let speedMultiplierElement = null;
  let speedMultiplierHideTimer = null;
  let hudElement = null;
  const KEYSTROKE_WINDOW_MS = 5000;

  function updatePointer(event) {
    lastPointer = { x: event.clientX, y: event.clientY };
  }

  window.addEventListener('mousedown', updatePointer, true);
  window.addEventListener('pointermove', updatePointer, true);

  function isInsideTrackedTarget(target) {
    if (!target || typeof target.closest !== 'function') {
      return false;
    }

    return config.targetSelectors.some((selector) => target.closest(selector));
  }

  function getSelectionAnchor() {
    const selection = window.getSelection && window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.left === 0 && rect.top === 0 && rect.width === 0 && rect.height === 0)) {
      return null;
    }

    return {
      x: rect.left + Math.max(2, rect.width),
      y: rect.top + rect.height / 2,
    };
  }

  function getTrackedContainerForElement(element) {
    if (!element || typeof element.closest !== 'function') {
      return null;
    }

    for (const selector of config.targetSelectors) {
      const match = element.closest(selector);
      if (match) {
        return match;
      }
    }

    return null;
  }

  function getChatInputContenteditable(container) {
    const root = container || document;
    const editor =
      (root.matches && root.matches('.interactive-input-editor') && root) ||
      (root.querySelector && root.querySelector('.interactive-input-editor'));

    if (!editor || !editor.querySelector) {
      return null;
    }

    const contenteditable = editor.querySelector('[contenteditable="true"]') ||
      editor.querySelector('.native-edit-context');
    return contenteditable || null;
  }

  function getMonacoCursorAnchor(container) {
    const roots = [];

    if (container && container.matches && container.matches('.monaco-editor')) {
      roots.push(container);
    } else if (container && container.querySelectorAll) {
      const scoped = container.querySelectorAll('.monaco-editor');
      for (const item of scoped) {
        roots.push(item);
      }
    }

    if (roots.length === 0) {
      const fallback = document.querySelectorAll('.interactive-input-editor .monaco-editor');
      for (const item of fallback) {
        roots.push(item);
      }
    }

    for (const editor of roots) {
      const cursor = editor.querySelector('.cursors-layer .cursor');
      if (!cursor || typeof cursor.getBoundingClientRect !== 'function') {
        continue;
      }

      const rect = cursor.getBoundingClientRect();
      if (!rect || (rect.left === 0 && rect.top === 0 && rect.height === 0)) {
        continue;
      }

      return {
        x: rect.left + Math.max(1, rect.width),
        y: rect.top + rect.height / 2,
      };
    }

    return null;
  }

  function getElementAnchor(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      return null;
    }

    const rect = element.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return null;
    }

    const isTextInput =
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'INPUT' ||
      element.classList.contains('inputarea') ||
      element.classList.contains('native-edit-context') ||
      element.getAttribute('contenteditable') === 'true';

    if (!isTextInput) {
      return null;
    }

    if (element.getAttribute('contenteditable') === 'true') {
      const selectionAnchor = getSelectionAnchor();
      if (selectionAnchor) {
        return selectionAnchor;
      }
    }

    const x = rect.left + Math.min(3, Math.max(1, rect.width));
    const y = rect.top + rect.height / 2;
    return { x, y };
  }

  function resolveAnchor(event, trackedContainer) {
    if (config.anchorMode === 'pointer') {
      return lastPointer;
    }

    const monacoCursorAnchor = getMonacoCursorAnchor(trackedContainer);
    if (monacoCursorAnchor) {
      return monacoCursorAnchor;
    }

    const selectionAnchor = getSelectionAnchor();
    if (selectionAnchor) {
      return selectionAnchor;
    }

    const targetAnchor = getElementAnchor(event.target);
    if (targetAnchor) {
      return targetAnchor;
    }

    const activeAnchor = getElementAnchor(document.activeElement);
    if (activeAnchor) {
      return activeAnchor;
    }

    const chatInputAnchor = getElementAnchor(getChatInputContenteditable(trackedContainer));
    if (chatInputAnchor) {
      return chatInputAnchor;
    }

    return lastPointer;
  }

  function stopShake() {
    if (document.body) {
      document.body.classList.remove('pm-shake');
    }
    if (hitCounterElement) {
      hitCounterElement.classList.remove('pm-hit-counter-visible');
    }
    updateHud();
  }

  function ensureHitCounter() {
    if (hitCounterElement || !document.body) {
      return hitCounterElement;
    }

    hitCounterElement = document.createElement('div');
    hitCounterElement.id = 'pm-hit-counter';
    hitCounterElement.setAttribute('aria-hidden', 'true');
    document.body.appendChild(hitCounterElement);
    return hitCounterElement;
  }

  function ensureHud() {
    if (hudElement || !document.body) {
      return hudElement;
    }

    hudElement = document.createElement('div');
    hudElement.id = 'pm-live-hud';
    hudElement.setAttribute('aria-hidden', 'true');
    document.body.appendChild(hudElement);
    return hudElement;
  }

  function updateHud() {
    const hud = ensureHud();
    if (!hud) {
      return;
    }

    hud.innerHTML = `
      <div class="pm-live-hud-row"><span class="pm-live-hud-label">COMBO</span><span class="pm-live-hud-value">${combo}</span></div>
      <div class="pm-live-hud-row"><span class="pm-live-hud-label">WPM</span><span class="pm-live-hud-value">${currentWpm}</span></div>
    `;
  }

  function showHitCounter(x, y) {
    if (!config.hitCounterEnabled || !document.body) {
      return;
    }

    const counter = ensureHitCounter();
    if (!counter) {
      return;
    }

    const memeLabels = safetyOff
      ? [
          combo >= 100 ? '💀 DEAD' :
          combo >= 75  ? '🔥🔥🔥 CRISPY' :
          combo >= 50  ? '🤡 CLOWNMODE' :
          combo >= 30  ? '🚀 BLASTING' :
          combo >= 15  ? '😤 GOING IN' :
                         '🤙 WAGMI'
        ][0] + ` ${combo}`
      : `${combo} HIT`;
    counter.textContent = memeLabels;
    counter.classList.remove('pm-hit-tier-1', 'pm-hit-tier-2', 'pm-hit-tier-3');
    if (combo >= 40) {
      counter.classList.add('pm-hit-tier-3');
    } else if (combo >= 20) {
      counter.classList.add('pm-hit-tier-2');
    } else {
      counter.classList.add('pm-hit-tier-1');
    }
    counter.style.left = `${x + config.hitCounterOffsetX}px`;
    counter.style.top = `${y + config.hitCounterOffsetY}px`;
    counter.classList.remove('pm-hit-counter-visible');
    void counter.offsetWidth;
    counter.classList.add('pm-hit-counter-visible');

    clearTimeout(hitCounterHideTimer);
    hitCounterHideTimer = setTimeout(() => {
      if (hitCounterElement) {
        hitCounterElement.classList.remove('pm-hit-counter-visible');
        combo = 0;
        stopShake();
      }
    }, config.hitCounterLifetimeMs);
  }

  function recordTypedCharsForWpm(typedChars) {
    if (typedChars <= 0) {
      return;
    }

    const now = Date.now();
    recentTypedChars.push({ timestamp: now, chars: typedChars });
    recentTypedChars = recentTypedChars.filter((entry) => now - entry.timestamp < KEYSTROKE_WINDOW_MS);
    const charCount = recentTypedChars.reduce((sum, entry) => sum + entry.chars, 0);
    const windowMinutes = KEYSTROKE_WINDOW_MS / 60000;
    currentWpm = Math.round((charCount / 5) / windowMinutes);
    updateHud();
  }

  function getSpeedMultiplier() {
    if (safetyOff) {
      if (currentWpm >= 320) return 8.0;
      if (currentWpm >= 240) return 6.5;
      if (currentWpm >= 180) return 5.0;
      if (currentWpm >= 120) return 3.8;
      if (currentWpm >= 80) return 2.6;
      return 1.8;
    }
    if (currentWpm >= 200) return 2.0;
    if (currentWpm >= 150) return 1.8;
    if (currentWpm >= 100) return 1.5;
    if (currentWpm >= 50) return 1.2;
    return 1.0;
  }

  function showSpeedMultiplier(x, y) {
    if ((!safetyOff && currentWpm < 50) || !document.body) {
      return;
    }

    let element = speedMultiplierElement;
    if (!element) {
      element = document.createElement('div');
      element.id = 'pm-speed-multiplier';
      element.setAttribute('aria-hidden', 'true');
      document.body.appendChild(element);
      speedMultiplierElement = element;
    }

    const multiplier = getSpeedMultiplier();
    element.textContent = `${multiplier.toFixed(1)}x`;
    element.style.left = `${x + 20}px`;
    element.style.top = `${y - 20}px`;
    element.classList.remove('pm-speed-visible');
    void element.offsetWidth;
    element.classList.add('pm-speed-visible');

    clearTimeout(speedMultiplierHideTimer);
    speedMultiplierHideTimer = setTimeout(() => {
      if (speedMultiplierElement) {
        speedMultiplierElement.classList.remove('pm-speed-visible');
      }
    }, 300);
  }

  function bumpCombo() {
    combo += 1;
    clearTimeout(comboResetTimer);
    comboResetTimer = setTimeout(() => {
      combo = 0;
      recentTypedChars = [];
      currentWpm = 0;
      stopShake();
    }, config.comboDecayMs);

    if (config.shakeEnabled && combo >= config.comboShakeThreshold && document.body) {
      const speedMult = getSpeedMultiplier();
      const scaledDuration = Math.round(config.shakeDurationMs * speedMult);
      const scaledDistance = Math.max(1, Math.round(config.shakeDistancePx * speedMult));
      document.body.style.setProperty('--pm-shake-duration', `${scaledDuration}ms`);
      document.body.style.setProperty('--pm-shake-distance', `${scaledDistance}px`);
      document.body.classList.remove('pm-shake');
      void document.body.offsetWidth;
      document.body.classList.add('pm-shake');
    }

    updateHud();
  }

  function getParticleBaseColor(trackedContainer) {
    if (!config.particleFollowTextColor) {
      return `hsl(${Math.floor(Math.random() * 360)}, ${config.particleSaturation}%, ${config.particleLightness}%)`;
    }

    const textElement =
      getChatInputContenteditable(trackedContainer) ||
      (trackedContainer && trackedContainer.querySelector && trackedContainer.querySelector('.view-lines')) ||
      (trackedContainer && trackedContainer.matches && trackedContainer.matches('.view-lines') && trackedContainer) ||
      (trackedContainer && trackedContainer.matches && trackedContainer.matches('.native-edit-context') && trackedContainer) ||
      document.querySelector('.interactive-input-editor .view-lines') ||
      document.body;

    if (!textElement) {
      return 'rgb(191, 191, 191)';
    }

    const computed = window.getComputedStyle(textElement).color;
    return computed || 'rgb(191, 191, 191)';
  }

  const MEME_SHAPES = ['50%', '50% 0 0 50%', '0', '30%', '50% 50% 0 0'];
  const MEME_EMOJIS = ['💥','⚡','🔥','✨','💫','🌟','💀','🤯','🎆','🎇'];

  function spawnParticles(x, y, trackedContainer) {
    if (!document.body) {
      return;
    }

    const particleColor = getParticleBaseColor(trackedContainer);
    const speedMult = getSpeedMultiplier();
    const scaledSize = Math.max(2, Math.round(config.particleSizePx * speedMult));
    const scaledOpacity = Math.min(1, (0.40 + Math.random() * 0.55) * speedMult);
    const particleBurstCount = safetyOff
      ? Math.round(config.particlesPerKeystroke * Math.max(1, speedMult * 0.6))
      : config.particlesPerKeystroke;

    for (let index = 0; index < particleBurstCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distanceScale = safetyOff ? Math.max(1.5, speedMult) : 1;
      const distance = (config.particleDistanceMin + Math.random() * particleDistanceRange) * distanceScale;
      const deltaX = Math.cos(angle) * distance;
      const deltaY = Math.sin(angle) * distance;

      if (safetyOff && Math.random() < 0.12) {
        // Emoji particle for insanity mode
        const em = document.createElement('div');
        em.className = 'pm-particle pm-emoji-particle';
        em.textContent = MEME_EMOJIS[Math.floor(Math.random() * MEME_EMOJIS.length)];
        em.style.left = `${x}px`;
        em.style.top = `${y}px`;
        em.style.setProperty('--dx', `${deltaX}px`);
        em.style.setProperty('--dy', `${deltaY}px`);
        document.body.appendChild(em);
        setTimeout(() => em.remove(), config.particleLifetimeMs);
        continue;
      }

      const particle = document.createElement('div');
      particle.className = 'pm-particle';
      if (safetyOff) {
        particle.style.borderRadius = MEME_SHAPES[Math.floor(Math.random() * MEME_SHAPES.length)];
        // full random hue per particle when safetyOff
        particle.style.backgroundColor = `hsl(${Math.floor(Math.random() * 360)}, 100%, 72%)`;
      } else {
        particle.style.backgroundColor = particleColor;
      }
      particle.style.left = `${x + config.particleOffsetX}px`;
      particle.style.top = `${y + config.particleOffsetY}px`;
      particle.style.width = `${scaledSize}px`;
      particle.style.height = `${scaledSize}px`;
      particle.style.opacity = `${scaledOpacity}`;
      particle.style.setProperty('--dx', `${deltaX}px`);
      particle.style.setProperty('--dy', `${deltaY}px`);

      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), config.particleLifetimeMs);
    }

    if (safetyOff) {
      flashScreen();
    }
  }

  let flashTimeout = null;
  function flashScreen() {
    if (!document.body) return;
    clearTimeout(flashTimeout);
    const hue = Math.floor(Math.random() * 360);
    document.body.style.setProperty('--pm-flash-hue', hue);
    document.body.classList.add('pm-flash');
    flashTimeout = setTimeout(() => {
      document.body.classList.remove('pm-flash');
    }, 60);
  }

  function shouldCountKey(event) {
    if (config.ignoreKeys.includes(event.key)) {
      return false;
    }

    if (config.countNavigationKeys) {
      return true;
    }

    if (event.key.length === 1) {
      return true;
    }

    return ['Backspace', 'Delete', 'Enter', 'Tab'].includes(event.key);
  }

  window.addEventListener('beforeinput', (event) => {
    if (!isInsideTrackedTarget(event.target)) {
      return;
    }

    if (!event.inputType || !event.inputType.startsWith('insert')) {
      return;
    }

    const typedChars = typeof event.data === 'string' && event.data.length > 0
      ? event.data.length
      : (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph' ? 1 : 0);

    recordTypedCharsForWpm(typedChars);
  }, true);

  window.addEventListener('keydown', (event) => {
    if (!shouldCountKey(event)) {
      return;
    }

    if (!isInsideTrackedTarget(event.target)) {
      return;
    }

    bumpCombo();
    const trackedContainer = getTrackedContainerForElement(event.target);
    const anchor = resolveAnchor(event, trackedContainer);
    showHitCounter(anchor.x, anchor.y);
    showSpeedMultiplier(anchor.x, anchor.y);
    spawnParticles(anchor.x, anchor.y, trackedContainer);

    if (trackedContainer) {
      trackedContainer.classList.add('pm-combo-glow');
      trackedContainer.style.setProperty('--pm-combo-intensity', safetyOff ? Math.min(4, combo / 18) : Math.min(1, combo / 100));
    }
  }, true);

  const style = document.createElement('style');
  style.id = 'vscode-juicer-injector-style';
  style.textContent = `
    :root {
      --pm-shake-duration: ${config.shakeDurationMs}ms;
      --pm-shake-distance: ${config.shakeDistancePx}px;
      --pm-combo-intensity: 0;
      --pm-particle-lifetime: ${config.particleLifetimeMs}ms;
      --pm-shake-loop: ${config.shakeLoop ? 'infinite' : '1'};
    }

    #pm-live-hud {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 100001;
      pointer-events: none;
      min-width: 120px;
      padding: 10px 12px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 78%, transparent);
      border: 1px solid color-mix(in srgb, var(--vscode-focusBorder, #007acc) 35%, transparent);
      box-shadow:
        0 8px 28px rgba(0, 0, 0, 0.28),
        0 0 24px rgba(255, 107, 107, 0.1);
      backdrop-filter: blur(10px);
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    }

    .pm-live-hud-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .pm-live-hud-row + .pm-live-hud-row {
      margin-top: 6px;
    }

    .pm-live-hud-label {
      font-size: 10px;
      letter-spacing: 0.12em;
      color: var(--vscode-descriptionForeground, #a6a6a6);
    }

    .pm-live-hud-value {
      font-size: 16px;
      font-weight: 800;
      color: var(--vscode-editor-foreground, #f3f3f3);
    }

    .pm-emoji-particle {
      background: none !important;
      border-radius: 0 !important;
      font-size: 32px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    body.pm-flash {
      animation: pm-flash-burst 60ms ease-out forwards;
    }

    @keyframes pm-flash-burst {
      0%   { filter: hue-rotate(0deg) brightness(1.8) saturate(2); }
      100% { filter: hue-rotate(calc(var(--pm-flash-hue, 180) * 1deg)) brightness(1); }
    }

    .pm-particle {
      position: fixed;
      border-radius: 50%;
      pointer-events: none;
      z-index: 99999;
      animation: pm-burst var(--pm-particle-lifetime, 260ms) ease-out forwards;
    }

    #pm-hit-counter {
      position: fixed;
      z-index: 100000;
      pointer-events: none;
      opacity: 0;
      transform: translate(-50%, -100%) scale(0.72);
      padding: 0;
      font-family: Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
      font-style: italic;
      font-size: 15px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0.06em;
      white-space: nowrap;
      color: var(--vscode-editor-foreground, #d4d4d4);
      text-shadow:
        0 0 0.5px rgba(0, 0, 0, 0.85),
        0 1px 0 rgba(0, 0, 0, 0.7),
        0 0 8px color-mix(in srgb, var(--vscode-focusBorder, #007acc) 42%, transparent);
      -webkit-text-stroke: 0.6px color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 40%, #000);
    }

    #pm-hit-counter.pm-hit-counter-visible {
      opacity: 1;
      animation: pm-hit-pop 180ms cubic-bezier(0.17, 0.89, 0.32, 1.28) forwards;
    }

    #pm-hit-counter.pm-hit-tier-2 {
      color: var(--vscode-terminal-ansiYellow, #f9d66f);
      text-shadow:
        0 0 0.5px rgba(0, 0, 0, 0.9),
        0 1px 0 rgba(0, 0, 0, 0.75),
        0 0 12px color-mix(in srgb, var(--vscode-terminal-ansiYellow, #f9d66f) 55%, transparent);
    }

    #pm-hit-counter.pm-hit-tier-3 {
      color: var(--vscode-terminal-ansiRed, #ff6b6b);
      text-shadow:
        0 0 0.5px rgba(0, 0, 0, 0.92),
        0 1px 0 rgba(0, 0, 0, 0.8),
        0 0 14px color-mix(in srgb, var(--vscode-terminal-ansiRed, #ff6b6b) 62%, transparent);
    }

    #pm-speed-multiplier {
      position: fixed;
      z-index: 100000;
      pointer-events: none;
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.5);
      font-family: 'Arial Black', sans-serif;
      font-size: 14px;
      font-weight: 900;
      color: var(--vscode-terminal-ansiCyan, #17eded);
      text-shadow:
        0 0 4px var(--vscode-terminal-ansiCyan, #17eded),
        0 0 8px rgba(23, 237, 237, 0.5);
    }

    #pm-speed-multiplier.pm-speed-visible {
      opacity: 1;
      animation: pm-speed-float 300ms ease-out forwards;
    }

    .pm-combo-glow {
      box-shadow:
        inset 0 0 calc(20px + (var(--pm-combo-intensity) * 12px)) rgba(255, 107, 107, calc(var(--pm-combo-intensity) * 0.4)),
        0 0 calc(18px + (var(--pm-combo-intensity) * 18px)) rgba(255, 64, 64, calc(var(--pm-combo-intensity) * 0.28)) !important;
    }

    @keyframes pm-speed-float {
      0% {
        transform: translate(-50%, -50%) scale(0.5);
        opacity: 0;
      }
      50% {
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -80%) scale(1);
        opacity: 0;
      }
    }

    @keyframes pm-hit-pop {
      0% {
        transform: translate(-50%, -100%) scale(0.72);
      }
      55% {
        transform: translate(-50%, -100%) scale(1.16);
      }
      100% {
        transform: translate(-50%, -100%) scale(1);
      }
    }

    @keyframes pm-burst {
      0%   { transform: translate(0, 0) scale(1); opacity: 1; }
      100% { transform: translate(var(--dx), var(--dy)) scale(0.15); opacity: 0; }
    }

    body.pm-shake {
      animation: pm-shake var(--pm-shake-duration) var(--pm-shake-loop, 1);
    }

    @keyframes pm-shake {
      0%   { transform: translate(0, 0); }
      25%  { transform: translate(var(--pm-shake-distance), calc(var(--pm-shake-distance) * -1)); }
      50%  { transform: translate(calc(var(--pm-shake-distance) * -1), var(--pm-shake-distance)); }
      75%  { transform: translate(var(--pm-shake-distance), var(--pm-shake-distance)); }
      100% { transform: translate(0, 0); }
    }
  `;

  if (!document.getElementById(style.id)) {
    document.head.appendChild(style);
  }

  window.__vscodeJuicerApplyConfig = applyLiveConfig;

  window.vscodeJuicer = {
    getConfig: () => ({ ...config }),
    setConfig: (nextConfig) => {
      if (!nextConfig || typeof nextConfig !== 'object') {
        return;
      }
      applyLiveConfig(nextConfig);
      window.localStorage.setItem('vscodeJuicerConfig', JSON.stringify({ ...config }));
    },
    resetConfig: () => {
      window.localStorage.removeItem('vscodeJuicerConfig');
      window.location.reload();
    },
  };

  startLiveConfigPolling();
  console.log('[vscode-juicer-injector] loaded with live-config polling', config);
})();
