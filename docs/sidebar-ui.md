# Sidebar UI

> The "Control Deck" webview: a fully data-driven settings panel generated from a
> pure field/category descriptor, plus step-button controls.

**Key files:** `out/src/chat-settings-view.js` (webview host + HTML/script), `out/src/chat-settings-fields.js` (pure descriptors), `out/src/extension.js` (`getState`/`setConfig` handlers)
**Related:** [architecture.md](architecture.md), [live-config.md](live-config.md), [presets.md](presets.md)
**last-verified:** 2026-07-20

## Single source of truth

`out/src/chat-settings-fields.js` exports `CATEGORIES` (ordered `{id, title}` list)
and `FIELDS` — one descriptor per setting: every `chat-config.js` `RUNTIME_KEYS`
entry plus `enabled`/`preset`/`safetyOff`. A field descriptor carries `type`
(`number` | `boolean` | `enum` | `array-readonly`), `category`, and for numbers
`min`/`max`/`insanityMax`. A test enforces **every `RUNTIME_KEYS` entry has exactly
one `FIELDS` descriptor** — add both together (see `CLAUDE.md` Global rules).

`extension.js`'s `getState` builds the sidebar's `settings` object by calling
`resolveRuntime` (the same function the installer uses), not by hand-listing keys —
a new `RUNTIME_KEYS` entry reaches the sidebar automatically once it has a `FIELDS`
descriptor.

## Rendering model

`chat-settings-view.js`'s `getHtmlContent()` embeds `CATEGORIES`/`FIELDS` as JSON
into the webview's inline `<script>`. The **webview itself builds all DOM at load
time** from that JSON (one category `<details>` per non-empty category, one control
per field) — there is no per-field hand-templated HTML to keep in sync.

`targetSelectors`/`ignoreKeys` (arrays) render as a read-only preview with a link to
**Open Full Settings** rather than an array editor — sliders/steppers don't fit
array values.

## Step buttons

Each numeric field gets a stepper-button row above the slider: decrement buttons
(largest magnitude outward) on the left, increment buttons on the right, e.g.
particle size (1–120) → `-4 -2 -1 | slider | +1 +2 +4`.
Magnitudes are derived per-field from its active range, not a fixed set —
`deriveSteps(min, max)` takes
~1% of the range, rounds to a nice 1/2/5×10ⁿ value as `base`, and returns the ladder
`[base, base*2, base*4]`. When the preset changes to/from `insanity`, the ladder is
recomputed against `insanityMax` (wider ranges get proportionally bigger steps).

**No module system in the webview** (same sandboxing as `renderer/vscode-juicer-injector.js`):
`deriveSteps`/`niceStep`/`clampValue` are duplicated verbatim as inline browser JS
inside the `<script>` block. Keep both copies in sync — they're small and stable,
but a future change to the step formula must land in both `chat-settings-fields.js`
and the inline copy.

## Testing

`test/chat-settings-fields.test.js` — descriptor coverage/shape (pure, no DOM).
`test/chat-settings-view.test.js` — loads the real `getHtmlContent()` output into
jsdom (stubbing the `vscode` module, which doesn't exist as a real package outside
the extension host) and drives it like a browser: renders all fields, dispatches a
state push, clicks a stepper button, switches preset and confirms the ladder
rescales. → [testing.md](testing.md)
