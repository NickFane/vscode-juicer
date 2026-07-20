# Effects

> What the juice actually is, on both layers, plus the enhancement backlog.

**Key files:** `renderer/vscode-juicer-injector.js` (chat effects), `out/src/screen-shaker/`, `out/src/cursor-exploder/`, `out/src/combo/` (editor effects)
**Related:** [architecture.md](architecture.md), [presets.md](presets.md), [live-config.md](live-config.md)
**last-verified:** 2026-07-20

## Renderer (chat) effects — in the injector

- **combo** — `bumpCombo` increments a streak that decays after `comboDecayMs` of
  inactivity; drives shake once `comboShakeThreshold` is reached.
- **shake** — scaled screen shake via CSS custom properties + keyframes.
- **particles** — `spawnParticles` bursts per qualifying keystroke, anchored to the
  caret or pointer (`anchorMode`); insanity adds emoji/flash variants.
- **hit counter** — floating "+N" near the caret.
- **WPM / speed multiplier HUD** — `recordTypedCharsForWpm` + a live speed
  multiplier HUD (a "heat"-style ramp as you keep typing) and a bottom-right HUD.

## Editor effects — extension host

Combo meter (editor or status bar), screen shake, and cursor explosions, gated by
`vscodeJuicer.combo/shake/explosions.*`. Driven by the plugin classes through the
`onPowermodeStart`/`onPowermodeStop` contract (internal naming — see [architecture.md](architecture.md)).

## Backlog (enhancement ideas)

Menu of juice/gamification ideas drawn from power-mode + game-feel best practice,
for future work — not yet built:

- **Heat/temperature meter** that ramps with sustained typing (extends the existing
  speed-multiplier HUD).
- **Combo milestones** — escalating shake + particle bursts at streak thresholds.
- **Personal bests** — highest WPM, longest combo/streak; persist in global storage
  (stats plumbing already exists via `context.globalState`).
- **Optional SFX layer** (off by default) for hits and milestones.
- **Keyboard heat-map / per-key stats** (stretch).
- **Performance guardrails** — particle-frequency throttle, "continue" vs "restart"
  gif modes (as documented in the original Power Mode perf guidance) to keep the
  editor responsive under heavy effects.
