/**
 * Host-agnostic particle / hit-counter / growth / float / shake / combo / WPM
 * effects, factored out of renderer/vscode-juicer-injector.js.
 *
 * This module has NO dependency on window.__vscodeJuicer* globals, fetch, or
 * anchor-guessing (querying arbitrary external DOM via CSS selectors) - those
 * were only needed because the injector has to find someone else's chat input
 * inside the patched workbench. A host that owns its own input element (like
 * the Composer webview) just passes that element's coordinates directly.
 *
 * Plain browser script (no module system), loaded via a <script> tag - same
 * convention as vscode-juicer-injector.js, so it works unmodified inside any
 * webview. Exposes window.VSJuicerEffectsCore = { createEffects }.
 *
 * NOTE: vscode-juicer-injector.js (the patched-workbench renderer, unchanged
 * on `main`) is NOT yet wired to this module - see docs/composer.md for why
 * that unification is deferred to a follow-up, lower-risk PR.
 */
(function (global) {
  'use strict';

  const MEME_SHAPES = ['50%', '50% 0 0 50%', '0', '30%', '50% 50% 0 0'];
  const MEME_EMOJIS = ['💥', '⚡', '🔥', '✨', '💫', '🌟', '💀', '🤯', '🎆', '🎇'];
  const KEYSTROKE_WINDOW_MS = 5000;
  const PM_MULTIPLIER_GAP_PX = 10;
  const PM_MULTIPLIER_FALLBACK_HALF_WIDTH_PX = 60;
  const PM_HIT_GROWTH_COMBO_CAP = 60;
  const PM_HIT_GROWTH_PER_COMBO = 0.015;

  function getHitGrowth(comboValue) {
    return 1 + Math.min(comboValue, PM_HIT_GROWTH_COMBO_CAP) * PM_HIT_GROWTH_PER_COMBO;
  }

  /**
   * `config` is a plain, caller-owned, mutable object (same shape as the
   * injector's DEFAULT_CONFIG plus `safetyOff`). Effects read it live on every
   * call, so a caller can Object.assign new values into it at any time (the
   * same pattern the injector's applyLiveConfig already uses) with no extra
   * wiring needed here.
   */
  function createEffects(config) {
    let combo = 0;
    let comboResetTimer = null;
    let hitCounterElement = null;
    let hitCounterHideTimer = null;
    let recentTypedChars = [];
    let currentWpm = 0;
    let speedMultiplierElement = null;
    let speedMultiplierHideTimer = null;
    let hudElement = null;
    let flashTimeout = null;

    function safetyOff() {
      return !!config.safetyOff;
    }

    function particleDistanceRange() {
      return Math.max(0, config.particleDistanceMax - config.particleDistanceMin);
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
      if (!hud) return;
      hud.innerHTML =
        '<div class="pm-live-hud-row"><span class="pm-live-hud-label">COMBO</span>' +
        '<span class="pm-live-hud-value">' + combo + '</span></div>' +
        '<div class="pm-live-hud-row"><span class="pm-live-hud-label">WPM</span>' +
        '<span class="pm-live-hud-value">' + currentWpm + '</span></div>';
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

    function getSpeedMultiplier() {
      if (safetyOff()) {
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

    function showHitCounter(x, y) {
      if (!config.hitCounterEnabled || !document.body) {
        return;
      }
      const counter = ensureHitCounter();
      if (!counter) return;

      const memeLabel = safetyOff()
        ? [
            combo >= 100 ? '💀 DEAD' :
            combo >= 75  ? '🔥🔥🔥 CRISPY' :
            combo >= 50  ? '🤡 CLOWNMODE' :
            combo >= 30  ? '🚀 BLASTING' :
            combo >= 15  ? '😤 GOING IN' :
                           '🤙 WAGMI'
          ][0] + ' ' + combo
        : combo + ' HIT';
      counter.textContent = memeLabel;
      counter.classList.remove('pm-hit-tier-1', 'pm-hit-tier-2', 'pm-hit-tier-3');
      if (combo >= 40) {
        counter.classList.add('pm-hit-tier-3');
      } else if (combo >= 20) {
        counter.classList.add('pm-hit-tier-2');
      } else {
        counter.classList.add('pm-hit-tier-1');
      }
      counter.style.setProperty('--pm-hit-growth', getHitGrowth(combo).toFixed(3));
      counter.classList.toggle('pm-hit-float', !!config.hitCounterFloatEnabled);
      if (config.hitCounterFloatEnabled) {
        counter.style.setProperty('--pm-hit-float-distance', config.hitCounterFloatDistancePx + 'px');
      }
      counter.style.left = (x + config.hitCounterOffsetX) + 'px';
      counter.style.top = (y + config.hitCounterOffsetY) + 'px';
      counter.classList.remove('pm-hit-counter-visible');
      void counter.offsetWidth;
      counter.classList.add('pm-hit-counter-visible');

      clearTimeout(hitCounterHideTimer);
      hitCounterHideTimer = setTimeout(function () {
        if (hitCounterElement) {
          hitCounterElement.classList.remove('pm-hit-counter-visible');
        }
      }, config.hitCounterLifetimeMs);
    }

    function showSpeedMultiplier(x, y) {
      if ((!safetyOff() && currentWpm < 50) || !document.body) {
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
      element.textContent = multiplier.toFixed(1) + 'x';
      const counterHalfWidth =
        hitCounterElement && hitCounterElement.offsetWidth > 0
          ? hitCounterElement.offsetWidth / 2
          : PM_MULTIPLIER_FALLBACK_HALF_WIDTH_PX;
      element.style.left = (x + config.hitCounterOffsetX + counterHalfWidth + PM_MULTIPLIER_GAP_PX) + 'px';
      element.style.top = (y + config.hitCounterOffsetY - 4) + 'px';
      element.classList.remove('pm-speed-visible');
      void element.offsetWidth;
      element.classList.add('pm-speed-visible');

      clearTimeout(speedMultiplierHideTimer);
      speedMultiplierHideTimer = setTimeout(function () {
        if (speedMultiplierElement) {
          speedMultiplierElement.classList.remove('pm-speed-visible');
        }
      }, 300);
    }

    function getParticleBaseColor(textSourceElement) {
      if (!config.particleFollowTextColor) {
        return 'hsl(' + Math.floor(Math.random() * 360) + ', ' + config.particleSaturation + '%, ' + config.particleLightness + '%)';
      }
      const textElement = textSourceElement || document.body;
      if (!textElement) {
        return 'rgb(191, 191, 191)';
      }
      const computed = window.getComputedStyle(textElement).color;
      return computed || 'rgb(191, 191, 191)';
    }

    function flashScreen() {
      if (!document.body) return;
      clearTimeout(flashTimeout);
      const hue = Math.floor(Math.random() * 360);
      document.body.style.setProperty('--pm-flash-hue', hue);
      document.body.classList.add('pm-flash');
      flashTimeout = setTimeout(function () {
        document.body.classList.remove('pm-flash');
      }, 60);
    }

    function spawnParticles(x, y, textSourceElement) {
      if (!document.body) return;

      const particleColor = getParticleBaseColor(textSourceElement);
      const speedMult = getSpeedMultiplier();
      const scaledSize = Math.max(2, Math.round(config.particleSizePx * speedMult));
      const scaledOpacity = Math.min(1, (0.40 + Math.random() * 0.55) * speedMult);
      const particleBurstCount = safetyOff()
        ? Math.round(config.particlesPerKeystroke * Math.max(1, speedMult * 0.6))
        : config.particlesPerKeystroke;
      const distanceRange = particleDistanceRange();

      for (let index = 0; index < particleBurstCount; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const distanceScale = safetyOff() ? Math.max(1.5, speedMult) : 1;
        const distance = (config.particleDistanceMin + Math.random() * distanceRange) * distanceScale;
        const deltaX = Math.cos(angle) * distance;
        const deltaY = Math.sin(angle) * distance;

        if (safetyOff() && Math.random() < 0.12) {
          const em = document.createElement('div');
          em.className = 'pm-particle pm-emoji-particle';
          em.textContent = MEME_EMOJIS[Math.floor(Math.random() * MEME_EMOJIS.length)];
          em.style.left = x + 'px';
          em.style.top = y + 'px';
          em.style.setProperty('--dx', deltaX + 'px');
          em.style.setProperty('--dy', deltaY + 'px');
          document.body.appendChild(em);
          setTimeout(function () { em.remove(); }, config.particleLifetimeMs);
          continue;
        }

        const particle = document.createElement('div');
        particle.className = 'pm-particle';
        if (safetyOff()) {
          particle.style.borderRadius = MEME_SHAPES[Math.floor(Math.random() * MEME_SHAPES.length)];
          particle.style.backgroundColor = 'hsl(' + Math.floor(Math.random() * 360) + ', 100%, 72%)';
        } else {
          particle.style.backgroundColor = particleColor;
        }
        particle.style.left = (x + config.particleOffsetX) + 'px';
        particle.style.top = (y + config.particleOffsetY) + 'px';
        particle.style.width = scaledSize + 'px';
        particle.style.height = scaledSize + 'px';
        particle.style.opacity = String(scaledOpacity);
        particle.style.setProperty('--dx', deltaX + 'px');
        particle.style.setProperty('--dy', deltaY + 'px');

        document.body.appendChild(particle);
        setTimeout(function () { particle.remove(); }, config.particleLifetimeMs);
      }

      if (safetyOff()) {
        flashScreen();
      }
    }

    function bumpCombo() {
      combo += 1;
      clearTimeout(comboResetTimer);
      comboResetTimer = setTimeout(function () {
        combo = 0;
        recentTypedChars = [];
        currentWpm = 0;
        stopShake();
      }, config.comboDecayMs);

      if (config.shakeEnabled && combo >= config.comboShakeThreshold && document.body) {
        const speedMult = getSpeedMultiplier();
        const scaledDuration = Math.round(config.shakeDurationMs * speedMult);
        const scaledDistance = Math.max(1, Math.round(config.shakeDistancePx * speedMult));
        document.body.style.setProperty('--pm-shake-duration', scaledDuration + 'ms');
        document.body.style.setProperty('--pm-shake-distance', scaledDistance + 'px');
        document.body.classList.remove('pm-shake');
        void document.body.offsetWidth;
        document.body.classList.add('pm-shake');
      }

      updateHud();
    }

    /**
     * The one entry point hosts call on every qualifying keystroke.
     * `anchor` = {x, y} in the host's own coordinate scheme (the Composer
     * just reads its input's own getBoundingClientRect(); the injector would
     * keep using its existing anchor-guessing to produce this same shape).
     * `containerEl` is what gets the shake animation + combo-glow styling
     * (the Composer's input wrapper; the injector's tracked chat container).
     */
    function triggerKeystroke(anchor, containerEl) {
      bumpCombo();
      showHitCounter(anchor.x, anchor.y);
      showSpeedMultiplier(anchor.x, anchor.y);
      spawnParticles(anchor.x, anchor.y, containerEl);

      if (containerEl) {
        containerEl.classList.add('pm-combo-glow');
        containerEl.style.setProperty(
          '--pm-combo-intensity',
          safetyOff() ? Math.min(4, combo / 18) : Math.min(1, combo / 100)
        );
      }
    }

    function recordTypedChars(typedChars) {
      if (typedChars <= 0) return;
      const now = Date.now();
      recentTypedChars.push({ timestamp: now, chars: typedChars });
      recentTypedChars = recentTypedChars.filter(function (entry) {
        return now - entry.timestamp < KEYSTROKE_WINDOW_MS;
      });
      const charCount = recentTypedChars.reduce(function (sum, entry) { return sum + entry.chars; }, 0);
      const windowMinutes = KEYSTROKE_WINDOW_MS / 60000;
      currentWpm = Math.round((charCount / 5) / windowMinutes);
      updateHud();
    }

    /** Push the current config's timing values onto CSS custom properties. */
    function applyLiveConfigVars(root) {
      root = root || document.documentElement;
      if (!root) return;
      root.style.setProperty('--pm-shake-duration', config.shakeDurationMs + 'ms');
      root.style.setProperty('--pm-shake-distance', config.shakeDistancePx + 'px');
      root.style.setProperty('--pm-particle-lifetime', config.particleLifetimeMs + 'ms');
      root.style.setProperty('--pm-shake-loop', config.shakeLoop ? 'infinite' : '1');
      root.style.setProperty('--pm-hit-lifetime', config.hitCounterLifetimeMs + 'ms');
    }

    /** Install the shared keyframe/element CSS once into `target` (default document.head). */
    function injectStyles(target) {
      target = target || document.head;
      if (!target || target.querySelector('#vscode-juicer-effects-style')) {
        return;
      }
      const style = document.createElement('style');
      style.id = 'vscode-juicer-effects-style';
      style.textContent = EFFECTS_CSS;
      target.appendChild(style);
    }

    function reset() {
      clearTimeout(comboResetTimer);
      clearTimeout(hitCounterHideTimer);
      clearTimeout(speedMultiplierHideTimer);
      clearTimeout(flashTimeout);
      combo = 0;
      recentTypedChars = [];
      currentWpm = 0;
    }

    return {
      injectStyles: injectStyles,
      applyLiveConfigVars: applyLiveConfigVars,
      triggerKeystroke: triggerKeystroke,
      recordTypedChars: recordTypedChars,
      reset: reset,
      getCombo: function () { return combo; },
      getWpm: function () { return currentWpm; }
    };
  }

  const EFFECTS_CSS = [
    ':root {',
    '  --pm-combo-intensity: 0;',
    '}',
    '#pm-live-hud {',
    '  position: fixed; right: 18px; bottom: 18px; z-index: 100001; pointer-events: none;',
    '  min-width: 120px; padding: 10px 12px; border-radius: 10px;',
    '  background: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 78%, transparent);',
    '  border: 1px solid color-mix(in srgb, var(--vscode-focusBorder, #007acc) 35%, transparent);',
    '  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28), 0 0 24px rgba(255, 107, 107, 0.1);',
    '  backdrop-filter: blur(10px); font-family: var(--vscode-font-family, "Segoe UI", sans-serif);',
    '}',
    '.pm-live-hud-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }',
    '.pm-live-hud-row + .pm-live-hud-row { margin-top: 6px; }',
    '.pm-live-hud-label { font-size: 10px; letter-spacing: 0.12em; color: var(--vscode-descriptionForeground, #a6a6a6); }',
    '.pm-live-hud-value { font-size: 16px; font-weight: 800; color: var(--vscode-editor-foreground, #f3f3f3); }',
    '.pm-emoji-particle { background: none !important; border-radius: 0 !important; font-size: 32px; line-height: 1; display: flex; align-items: center; justify-content: center; }',
    'body.pm-flash { animation: pm-flash-burst 60ms ease-out forwards; }',
    '@keyframes pm-flash-burst { 0% { filter: hue-rotate(0deg) brightness(1.8) saturate(2); } 100% { filter: hue-rotate(calc(var(--pm-flash-hue, 180) * 1deg)) brightness(1); } }',
    '.pm-particle { position: fixed; border-radius: 50%; pointer-events: none; z-index: 99999; animation: pm-burst var(--pm-particle-lifetime, 260ms) ease-out forwards; }',
    '#pm-hit-counter { position: fixed; z-index: 100000; pointer-events: none; opacity: 0; transform: translate(-50%, -100%) scale(calc(0.72 * var(--pm-hit-growth, 1))); padding: 0; font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif; font-style: italic; font-size: 15px; line-height: 1; font-weight: 900; letter-spacing: 0.06em; white-space: nowrap; color: var(--vscode-editor-foreground, #d4d4d4); text-shadow: 0 0 0.5px rgba(0,0,0,0.85), 0 1px 0 rgba(0,0,0,0.7), 0 0 8px color-mix(in srgb, var(--vscode-focusBorder, #007acc) 42%, transparent); -webkit-text-stroke: 0.6px color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 40%, #000); }',
    '#pm-hit-counter.pm-hit-counter-visible { opacity: 1; animation: pm-hit-pop 180ms cubic-bezier(0.17, 0.89, 0.32, 1.28) forwards; }',
    '#pm-hit-counter.pm-hit-counter-visible.pm-hit-float { animation-name: pm-hit-pop-float; animation-duration: var(--pm-hit-lifetime, 520ms); animation-timing-function: cubic-bezier(0.17, 0.89, 0.32, 1.28); animation-fill-mode: forwards; }',
    '#pm-hit-counter.pm-hit-tier-2 { color: var(--vscode-terminal-ansiYellow, #f9d66f); text-shadow: 0 0 0.5px rgba(0,0,0,0.9), 0 1px 0 rgba(0,0,0,0.75), 0 0 12px color-mix(in srgb, var(--vscode-terminal-ansiYellow, #f9d66f) 55%, transparent); }',
    '#pm-hit-counter.pm-hit-tier-3 { color: var(--vscode-terminal-ansiRed, #ff6b6b); text-shadow: 0 0 0.5px rgba(0,0,0,0.92), 0 1px 0 rgba(0,0,0,0.8), 0 0 14px color-mix(in srgb, var(--vscode-terminal-ansiRed, #ff6b6b) 62%, transparent); }',
    '#pm-speed-multiplier { position: fixed; z-index: 100000; pointer-events: none; opacity: 0; transform: translate(-50%, -50%) scale(0.5); font-family: "Arial Black", sans-serif; font-size: 14px; font-weight: 900; color: var(--vscode-terminal-ansiCyan, #17eded); text-shadow: 0 0 4px var(--vscode-terminal-ansiCyan, #17eded), 0 0 8px rgba(23,237,237,0.5); }',
    '#pm-speed-multiplier.pm-speed-visible { opacity: 1; animation: pm-speed-float 300ms ease-out forwards; }',
    '.pm-combo-glow { box-shadow: inset 0 0 calc(20px + (var(--pm-combo-intensity) * 12px)) rgba(255,107,107,calc(var(--pm-combo-intensity) * 0.4)), 0 0 calc(18px + (var(--pm-combo-intensity) * 18px)) rgba(255,64,64,calc(var(--pm-combo-intensity) * 0.28)) !important; }',
    '@keyframes pm-speed-float { 0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; } 50% { opacity: 1; } 100% { transform: translate(-50%, -80%) scale(1); opacity: 0; } }',
    '@keyframes pm-hit-pop { 0% { transform: translate(-50%, -100%) scale(calc(0.72 * var(--pm-hit-growth, 1))); } 55% { transform: translate(-50%, -100%) scale(calc(1.16 * var(--pm-hit-growth, 1))); } 100% { transform: translate(-50%, -100%) scale(calc(1 * var(--pm-hit-growth, 1))); } }',
    '@keyframes pm-hit-pop-float { 0% { transform: translate(-50%, -100%) scale(calc(0.72 * var(--pm-hit-growth, 1))); opacity: 0; } 35% { transform: translate(-50%, -100%) scale(calc(1.16 * var(--pm-hit-growth, 1))); opacity: 1; } 55% { transform: translate(-50%, -100%) scale(calc(1 * var(--pm-hit-growth, 1))); opacity: 1; } 100% { transform: translate(calc(-50% - var(--pm-hit-float-distance, 40px)), calc(-100% - var(--pm-hit-float-distance, 40px))) scale(calc(1 * var(--pm-hit-growth, 1))); opacity: 0; } }',
    '@keyframes pm-burst { 0% { transform: translate(0, 0) scale(1); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(0.15); opacity: 0; } }',
    'body.pm-shake { animation: pm-shake var(--pm-shake-duration) var(--pm-shake-loop, 1); }',
    '@keyframes pm-shake { 0% { transform: translate(0, 0); } 25% { transform: translate(var(--pm-shake-distance), calc(var(--pm-shake-distance) * -1)); } 50% { transform: translate(calc(var(--pm-shake-distance) * -1), var(--pm-shake-distance)); } 75% { transform: translate(var(--pm-shake-distance), var(--pm-shake-distance)); } 100% { transform: translate(0, 0); } }'
  ].join('\n');

  global.VSJuicerEffectsCore = { createEffects: createEffects };
})(typeof window !== 'undefined' ? window : globalThis);
