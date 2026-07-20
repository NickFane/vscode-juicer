"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const config_1 = require("./config/config");
const particles_1 = require("./config/particles");
const fireworks_1 = require("./config/fireworks");
const flames_1 = require("./config/flames");
const magic_1 = require("./config/magic");
const clippy_1 = require("./config/clippy");
const rift_1 = require("./config/rift");
const screen_shaker_1 = require("./screen-shaker/screen-shaker");
const cursor_exploder_1 = require("./cursor-exploder/cursor-exploder");
const combo_plugin_1 = require("./combo/combo-plugin");
const configuration_migrator_1 = require("./config/configuration-migrator");
const chat_renderer_installer_1 = require("./chat-renderer-installer");
const chat_settings_view_1 = require("./chat-settings-view");
const chat_config_1 = require("./chat-config");
// Config values
let enabled = false;
let comboThreshold;
let comboTimeout;
let comboTimeoutHandle;
// Native plugins
let screenShaker;
let cursorExploder;
let comboPlugin;
// PowerMode components
let plugins = [];
let documentChangeListenerDisposer;
let typingStatsListenerDisposer;
let chatSidebarProvider;
let extensionContext;
let comboStatusBarItem;
let wpmStatusBarItem;
const STATS_FLUSH_EVENT_THRESHOLD = 100;
let statsCache = {
    maxCombo: 0,
    totalTyped: 0,
    totalEvents: 0,
};
let pendingStats = {
    maxCombo: 0,
    totalTyped: 0,
    totalEvents: 0,
};
let statsCombo = 0;
let statsComboTimeoutHandle;
const KEYSTROKE_WINDOW_MS = 5000;
let recentTypedChars = [];
let lastWpm = 0;
// Themes
let themes = {
    fireworks: fireworks_1.Fireworks,
    particles: particles_1.Particles,
    flames: flames_1.Flames,
    magic: magic_1.Magic,
    clippy: clippy_1.Clippy,
    ["simple-rift"]: rift_1.SimpleRift,
    ["exploding-rift"]: rift_1.ExplodingRift,
};
// Current combo count
let combo = 0;
let isPowermodeActive = false;
// Tracks the last chat preset we force-applied, so changing the `preset` dropdown in
// the Settings UI re-applies the preset's per-key values exactly once (guards the
// write-loop applyPreset would otherwise cause).
let lastAppliedChatPreset;
const syncChatRenderer = (context) => (0, chat_renderer_installer_1.syncRendererFromConfiguration)(context)
    .catch((error) => {
    const message = error && error.message ? error.message : String(error);
    vscode.window.showWarningMessage(`VSCode Juicer renderer sync failed: ${message}. Try running with full file permissions and reload.`);
});
function activate(context) {
    extensionContext = context;
    statsCache = {
        maxCombo: context.globalState.get("vscodeJuicer.chat.maxCombo", 0),
        totalTyped: context.globalState.get("vscodeJuicer.chat.totalTyped", 0),
        totalEvents: context.globalState.get("vscodeJuicer.chat.totalEvents", 0),
    };
    pendingStats = {
        maxCombo: 0,
        totalTyped: 0,
        totalEvents: 0,
    };
    // Try to migrate any existing configuration files
    (0, configuration_migrator_1.migrateConfiguration)();
    const enableCommand = "vscodeJuicer.enableJuicer";
    const disableCommand = "vscodeJuicer.disableJuicer";
    const chatEnableCommand = "vscodeJuicer.chat.enable";
    const chatDisableCommand = "vscodeJuicer.chat.disable";
    const chatOpenSettingsCommand = "vscodeJuicer.chat.openSettings";
    const chatApplyPresetCommand = "vscodeJuicer.chat.applyJuicySubtlePreset";
    const setEnabled = (value) => {
        const config = vscode.workspace.getConfiguration("vscodeJuicer");
        (0, config_1.updateConfig)("enabled", value, config);
    };
    const setChatEnabled = async (value) => {
        const config = vscode.workspace.getConfiguration("vscodeJuicer.chat");
        await config.update("enabled", value, vscode.ConfigurationTarget.Global);
        await syncChatRenderer(context);
        chatSidebarProvider === null || chatSidebarProvider === void 0 ? void 0 : chatSidebarProvider.refresh();
    };
    const setChatNumericSetting = async (key, pickItems, title) => {
        const picked = await vscode.window.showQuickPick(pickItems.map((value) => ({
            label: String(value),
            value,
        })), { title });
        if (!picked) {
            return;
        }
        await vscode.workspace.getConfiguration("vscodeJuicer.chat").update(key, picked.value, vscode.ConfigurationTarget.Global);
        await syncChatRenderer(context);
        chatSidebarProvider === null || chatSidebarProvider === void 0 ? void 0 : chatSidebarProvider.refresh();
    };
    // Register enable/disable commands
    context.subscriptions.push(vscode.commands.registerCommand(enableCommand, () => setEnabled(true)));
    context.subscriptions.push(vscode.commands.registerCommand(disableCommand, () => setEnabled(false)));
    context.subscriptions.push(vscode.commands.registerCommand(chatEnableCommand, () => setChatEnabled(true)));
    context.subscriptions.push(vscode.commands.registerCommand(chatDisableCommand, () => setChatEnabled(false)));
    context.subscriptions.push(vscode.commands.registerCommand(chatOpenSettingsCommand, () => (0, chat_renderer_installer_1.openChatSettings)()));
    context.subscriptions.push(vscode.commands.registerCommand(chatApplyPresetCommand, () => { lastAppliedChatPreset = "juicy-subtle-v1"; return (0, chat_renderer_installer_1.applyPreset)(context, "juicy-subtle-v1").then(() => syncChatRenderer(context)).then(() => { var _a; return (_a = chatSidebarProvider) === null || _a === void 0 ? void 0 : _a.refresh(); }); }));
    context.subscriptions.push(vscode.commands.registerCommand("vscodeJuicer.chat.setParticleSize", () => setChatNumericSetting("particleSizePx", [2, 3, 4, 5, 6, 8], "Set VSCode Juicer Particle Size")));
    context.subscriptions.push(vscode.commands.registerCommand("vscodeJuicer.chat.setParticleDensity", () => setChatNumericSetting("particlesPerKeystroke", [2, 3, 4, 5, 6, 8, 10], "Set VSCode Juicer Particle Count Per Keystroke")));
    context.subscriptions.push(vscode.commands.registerCommand("vscodeJuicer.chat.resetStats", async () => {
        pendingStats = {
            maxCombo: 0,
            totalTyped: 0,
            totalEvents: 0,
        };
        statsCache = {
            maxCombo: 0,
            totalTyped: 0,
            totalEvents: 0,
        };
        statsCombo = 0;
        recentTypedChars = [];
        lastWpm = 0;
        await context.globalState.update("vscodeJuicer.chat.maxCombo", 0);
        await context.globalState.update("vscodeJuicer.chat.totalTyped", 0);
        await context.globalState.update("vscodeJuicer.chat.totalEvents", 0);
        updateStatusBar();
        chatSidebarProvider === null || chatSidebarProvider === void 0 ? void 0 : chatSidebarProvider.refresh();
    }));
    comboStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 110);
    comboStatusBarItem.name = "VSCode Juicer Combo";
    comboStatusBarItem.command = "vscodeJuicer.chat.openSettings";
    context.subscriptions.push(comboStatusBarItem);
    wpmStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 109);
    wpmStatusBarItem.name = "VSCode Juicer WPM";
    wpmStatusBarItem.command = "vscodeJuicer.chat.openSettings";
    context.subscriptions.push(wpmStatusBarItem);
    // Register sidebar webview provider with richer controls + live stats
    chatSidebarProvider = new chat_settings_view_1(context, {
        getState: () => {
            const cfg = vscode.workspace.getConfiguration("vscodeJuicer.chat");
            const presetName = cfg.get("preset", "juicy-subtle-v1");
            // resolveRuntime (chat-config.js) is the single source of truth for the
            // full settings shape - every RUNTIME_KEYS entry is exposed automatically,
            // so a new setting needs no edit here to reach the sidebar.
            const runtime = (0, chat_config_1.resolveRuntime)(presetName, (key, fallback) => cfg.get(key, fallback));
            return {
                settings: Object.assign({ enabled: cfg.get("enabled", true), preset: presetName }, runtime),
                stats: {
                    combo: statsCombo,
                    wpm: lastWpm,
                    maxCombo: Math.max(pendingStats.maxCombo, statsCache.maxCombo),
                    totalTyped: statsCache.totalTyped + pendingStats.totalTyped,
                    totalEvents: statsCache.totalEvents + pendingStats.totalEvents,
                },
            };
        },
        setConfig: async (key, value) => {
            await vscode.workspace.getConfiguration("vscodeJuicer.chat").update(key, value, vscode.ConfigurationTarget.Global);
            await syncChatRenderer(context);
        },
        setEnabled: async (value) => {
            await setChatEnabled(value);
        },
        applyPreset: async (presetName) => {
            const nextPreset = typeof presetName === "string" && presetName ? presetName : "juicy-subtle-v1";
            lastAppliedChatPreset = nextPreset;
            await (0, chat_renderer_installer_1.applyPreset)(context, nextPreset);
            await syncChatRenderer(context);
        },
        openSettings: async () => {
            await (0, chat_renderer_installer_1.openChatSettings)();
        },
        resetStats: async () => {
            await vscode.commands.executeCommand("vscodeJuicer.chat.resetStats");
        },
    });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("vscode-juicer-settings", chatSidebarProvider));
    // Register typing stats listener (always on, independent of editor power mode)
    typingStatsListenerDisposer = vscode.workspace.onDidChangeTextDocument(onDidTrackTypingStatsDocument);
    // Subscribe to configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (!event.affectsConfiguration("vscodeJuicer.chat")) {
            return;
        }
        // When the `preset` dropdown itself changes, re-apply the preset so its
        // per-key values overwrite any previously-written explicit values. Without
        // this the enum is inert once a preset has ever been applied (the explicit
        // per-key values always win in resolveRuntime).
        if (event.affectsConfiguration("vscodeJuicer.chat.preset")) {
            const presetName = vscode.workspace
                .getConfiguration("vscodeJuicer.chat")
                .get("preset", "juicy-subtle-v1");
            if (presetName !== lastAppliedChatPreset) {
                lastAppliedChatPreset = presetName;
                await (0, chat_renderer_installer_1.applyPreset)(context, presetName);
            }
        }
        await syncChatRenderer(context);
        chatSidebarProvider === null || chatSidebarProvider === void 0 ? void 0 : chatSidebarProvider.refresh();
    }));
    // Initialize from the current configuration
    onDidChangeConfiguration();
    updateStatusBar();
    syncChatRenderer(context);
}
exports.activate = activate;
function init(config, activeTheme) {
    // Just in case something was left behind, clean it up
    resetState();
    // The native plugins need this special theme, a subset of the config
    screenShaker = new screen_shaker_1.ScreenShaker(activeTheme),
        cursorExploder = new cursor_exploder_1.CursorExploder(activeTheme),
        comboPlugin = new combo_plugin_1.ComboPlugin();
    plugins.push(screenShaker, cursorExploder, comboPlugin);
    plugins.forEach(plugin => plugin.onDidChangeConfiguration(config));
    documentChangeListenerDisposer = vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument);
}
/**
 * Note: this method is also called automatically
 * when the extension is deactivated
 */
function deactivate() {
    void flushTypingStats();
    typingStatsListenerDisposer === null || typingStatsListenerDisposer === void 0 ? void 0 : typingStatsListenerDisposer.dispose();
    typingStatsListenerDisposer = undefined;
    stopStatsComboTimer();
    resetState();
}
exports.deactivate = deactivate;
function resetState() {
    void flushTypingStats();
    combo = 0;
    stopTimer();
    documentChangeListenerDisposer === null || documentChangeListenerDisposer === void 0 ? void 0 : documentChangeListenerDisposer.dispose();
    stopStatsComboTimer();
    statsCombo = 0;
    recentTypedChars = [];
    lastWpm = 0;
    updateStatusBar();
    while (plugins.length > 0) {
        plugins.shift().dispose();
    }
}
function onDidChangeConfiguration() {
    const config = vscode.workspace.getConfiguration("vscodeJuicer");
    const themeId = (0, config_1.getConfigValue)("presets", config);
    const theme = getThemeConfig(themeId);
    const oldEnabled = enabled;
    enabled = (0, config_1.getConfigValue)("enabled", config);
    comboThreshold = (0, config_1.getConfigValue)("combo.threshold", config);
    comboTimeout = (0, config_1.getConfigValue)("combo.timeout", config);
    // Switching from disabled to enabled
    if (!oldEnabled && enabled) {
        init(config, theme);
        return;
    }
    // Switching from enabled to disabled
    if (oldEnabled && !enabled) {
        resetState();
        return;
    }
    // If not enabled, nothing matters
    // because it will be taken care of
    // when it gets reenabled
    if (!enabled) {
        return;
    }
    // The theme needs set BEFORE onDidChangeConfiguration is called
    screenShaker.themeConfig = theme;
    cursorExploder.themeConfig = theme;
    plugins.forEach(plugin => plugin.onDidChangeConfiguration(config));
}
// This will be exposed so other extensions can contribute their own themes
// function registerTheme(themeId: string, config: ThemeConfig) {
//     themes[themeId] = config;
// }
function getThemeConfig(themeId) {
    return themes[themeId];
}
const onComboTimerExpired = () => {
    void flushTypingStats();
    plugins.forEach(plugin => plugin.onPowermodeStop(combo));
    plugins.forEach(plugin => plugin.onComboStop(combo));
    combo = 0;
    updateStatusBar();
    if (chatSidebarProvider) {
        chatSidebarProvider.refresh();
    }
};
function isPowerMode() {
    return enabled && combo >= comboThreshold;
}
function updateTypingStats(event) {
    if (!extensionContext) {
        return;
    }
    const typedDelta = event.contentChanges.reduce((sum, change) => sum + (change.text ? change.text.length : 0), 0);
    pendingStats.totalTyped += typedDelta;
    pendingStats.totalEvents += 1;
    pendingStats.maxCombo = Math.max(pendingStats.maxCombo, statsCombo);
    if (pendingStats.totalEvents >= STATS_FLUSH_EVENT_THRESHOLD) {
        void flushTypingStats();
    }
}
function getStatsComboTimeoutMs() {
    const config = vscode.workspace.getConfiguration("vscodeJuicer.chat");
    const comboDecayMs = config.get("comboDecayMs", 1500);
    if (typeof comboDecayMs === "number" && comboDecayMs > 0) {
        return comboDecayMs;
    }
    return 1500;
}
function stopStatsComboTimer() {
    clearTimeout(statsComboTimeoutHandle);
    statsComboTimeoutHandle = null;
}
function startStatsComboTimer() {
    stopStatsComboTimer();
    statsComboTimeoutHandle = setTimeout(() => {
        statsCombo = 0;
        recentTypedChars = [];
        lastWpm = 0;
        void flushTypingStats();
        updateStatusBar();
    }, getStatsComboTimeoutMs());
}
function onDidTrackTypingStatsDocument(event) {
    const typedChars = event.contentChanges.reduce((sum, change) => sum + (change.text ? change.text.length : 0), 0);
    statsCombo++;
    updateTypingStats(event);
    recordTypedCharsForWpm(typedChars);
    startStatsComboTimer();
    updateStatusBar();
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
    lastWpm = Math.round((charCount / 5) / windowMinutes);
}
function getWpm() {
    return lastWpm;
}
function updateStatusBar() {
    if (comboStatusBarItem) {
        comboStatusBarItem.text = `$(flame) Combo ${statsCombo}`;
        comboStatusBarItem.tooltip = "VSCode Juicer current combo";
        comboStatusBarItem.show();
    }
    if (wpmStatusBarItem) {
        wpmStatusBarItem.text = `$(dashboard) ${lastWpm} WPM`;
        wpmStatusBarItem.tooltip = "VSCode Juicer rolling words per minute";
        wpmStatusBarItem.show();
    }
}
async function flushTypingStats() {
    if (!extensionContext) {
        return;
    }
    if (pendingStats.totalEvents === 0 && pendingStats.totalTyped === 0 && pendingStats.maxCombo === 0) {
        return;
    }
    const nextStats = {
        totalTyped: statsCache.totalTyped + pendingStats.totalTyped,
        totalEvents: statsCache.totalEvents + pendingStats.totalEvents,
        maxCombo: Math.max(statsCache.maxCombo, pendingStats.maxCombo),
    };
    pendingStats = {
        maxCombo: 0,
        totalTyped: 0,
        totalEvents: 0,
    };
    statsCache = nextStats;
    await Promise.all([
        extensionContext.globalState.update("vscodeJuicer.chat.totalTyped", nextStats.totalTyped),
        extensionContext.globalState.update("vscodeJuicer.chat.totalEvents", nextStats.totalEvents),
        extensionContext.globalState.update("vscodeJuicer.chat.maxCombo", nextStats.maxCombo),
    ]);
    chatSidebarProvider === null || chatSidebarProvider === void 0 ? void 0 : chatSidebarProvider.refresh();
}
function onDidChangeTextDocument(event) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }
    combo++;
    const juicerActive = isPowerMode();
    startTimer();
    if (juicerActive != isPowermodeActive) {
        isPowermodeActive = juicerActive;
        isPowermodeActive ?
            plugins.forEach(plugin => plugin.onPowermodeStart(combo)) :
            plugins.forEach(plugin => plugin.onPowermodeStop(combo));
    }
    plugins.forEach(plugin => plugin.onDidChangeTextDocument({
        isPowermodeActive,
        comboTimeout,
        currentCombo: combo,
        activeEditor,
    }, event));
    updateStatusBar();
}
/**
 * Starts a "progress" in the bottom of the vscode window
 * which displays the time remaining for the current combo
 */
function startTimer() {
    stopTimer();
    if (comboTimeout === 0) {
        return;
    }
    comboTimeoutHandle = setTimeout(onComboTimerExpired, comboTimeout * 1000);
}
function stopTimer() {
    clearInterval(comboTimeoutHandle);
    comboTimeoutHandle = null;
}
//# sourceMappingURL=extension.js.map
