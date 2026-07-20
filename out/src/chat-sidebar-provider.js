"use strict";

const vscode = require("vscode");

class ChatSidebarItem extends vscode.TreeItem {
  constructor(label, description, collapsibleState = vscode.TreeItemCollapsibleState.None) {
    super(label, collapsibleState);
    this.description = description;
    this.contextValue = "vscodeJuicerItem";
  }
}

class ChatSidebarProvider {
  constructor(context, metricsAccessor = {}) {
    this.context = context;
    this.metricsAccessor = metricsAccessor;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    // Auto-refresh every 500ms for live metrics
    this.refreshInterval = setInterval(() => {
      this._onDidChangeTreeData.fire();
    }, 500);
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  dispose() {
    clearInterval(this.refreshInterval);
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (element) {
      return [];
    }

    const cfg = vscode.workspace.getConfiguration("vscodeJuicer.chat");
    const enabled = cfg.get("enabled", true);
    const preset = cfg.get("preset", "juicy-subtle-v1");
    const particleSize = cfg.get("particleSizePx", 4);
    const particlesPerKeystroke = cfg.get("particlesPerKeystroke", 5);

    const stats = this.getStats();
    const wpm = this.metricsAccessor.getWpm?.() ?? 0;
    const currentCombo = this.metricsAccessor.getStatsCombo?.() ?? 0;
    const maxCombo = this.metricsAccessor.getMaxCombo?.() ?? stats.maxCombo;

    const stateItem = new ChatSidebarItem(
      `Renderer: ${enabled ? "ON" : "OFF"}`,
      "Toggle chat effects"
    );
    stateItem.command = {
      title: "Toggle Renderer",
      command: enabled ? "vscodeJuicer.chat.disable" : "vscodeJuicer.chat.enable"
    };
    stateItem.iconPath = new vscode.ThemeIcon(enabled ? "flame" : "circle-slash");

    const presetItem = new ChatSidebarItem(`Preset: ${preset}`, "Apply Juicy Subtle v1");
    presetItem.command = {
      title: "Apply Preset",
      command: "vscodeJuicer.chat.applyJuicySubtlePreset"
    };
    presetItem.iconPath = new vscode.ThemeIcon("sparkle");

    const particleItem = new ChatSidebarItem(`Particle Size: ${particleSize}px`, "Click to change");
    particleItem.command = {
      title: "Set Particle Size",
      command: "vscodeJuicer.chat.setParticleSize"
    };
    particleItem.iconPath = new vscode.ThemeIcon("symbol-numeric");

    const densityItem = new ChatSidebarItem(`Particles/Key: ${particlesPerKeystroke}`, "Click to change");
    densityItem.command = {
      title: "Set Particle Density",
      command: "vscodeJuicer.chat.setParticleDensity"
    };
    densityItem.iconPath = new vscode.ThemeIcon("symbol-array");

    const openSettingsItem = new ChatSidebarItem("Open All Chat Settings", "Show full settings");
    openSettingsItem.command = {
      title: "Open Settings",
      command: "vscodeJuicer.chat.openSettings"
    };
    openSettingsItem.iconPath = new vscode.ThemeIcon("settings-gear");

    // Animated combo counter with tier-based display
    const comboTier = this.getComboTier(currentCombo);
    const comboEmoji = currentCombo >= 50 ? "🔥" : currentCombo >= 20 ? "⚡" : "✨";
    const comboItem = new ChatSidebarItem(
      `${comboEmoji} COMBO: ${currentCombo}`,
      `${comboTier} • Best: ${maxCombo}`
    );
    comboItem.iconPath = new vscode.ThemeIcon("graph");

    // WPM/Speed display with tier
    const speedTier = this.getSpeedTier(wpm);
    const wpmEmoji = wpm >= 180 ? "🚀" : wpm >= 100 ? "⚡" : "⏱";
    const wpmItem = new ChatSidebarItem(
      `${wpmEmoji} ${wpm} WPM`,
      `${speedTier} • Speed feedback`
    );
    wpmItem.iconPath = new vscode.ThemeIcon("pulse");

    const totalTypedItem = new ChatSidebarItem(`Total Typed: ${stats.totalTyped}`, "Characters tracked");
    totalTypedItem.iconPath = new vscode.ThemeIcon("keyboard");

    const totalEventsItem = new ChatSidebarItem(`Key Events: ${stats.totalEvents}`, "Document change events");
    totalEventsItem.iconPath = new vscode.ThemeIcon("pulse");

    const resetStatsItem = new ChatSidebarItem("Reset Stats", "Set counters back to 0");
    resetStatsItem.command = {
      title: "Reset Stats",
      command: "vscodeJuicer.chat.resetStats"
    };
    resetStatsItem.iconPath = new vscode.ThemeIcon("trash");

    return [
      stateItem,
      presetItem,
      particleItem,
      densityItem,
      openSettingsItem,
      comboItem,
      wpmItem,
      totalTypedItem,
      totalEventsItem,
      resetStatsItem
    ];
  }

  getStats() {
    return {
      maxCombo: this.context.globalState.get("vscodeJuicer.chat.maxCombo", 0),
      totalTyped: this.context.globalState.get("vscodeJuicer.chat.totalTyped", 0),
      totalEvents: this.context.globalState.get("vscodeJuicer.chat.totalEvents", 0)
    };
  }

  getComboTier(combo) {
    if (combo >= 100) return "LEGENDARY 🏆";
    if (combo >= 75) return "EPIC 👑";
    if (combo >= 50) return "RARE 🔥";
    if (combo >= 25) return "UNCOMMON ⚡";
    if (combo >= 10) return "COMMON ✨";
    return "STARTER 🌱";
  }

  getSpeedTier(wpm) {
    if (wpm >= 200) return "SONIC 🚀";
    if (wpm >= 150) return "SPEEDRUNNER ⚡";
    if (wpm >= 100) return "FAST 💨";
    if (wpm >= 50) return "STEADY 📝";
    if (wpm >= 20) return "TAPPING 🖱";
    return "IDLE ⏱";
  }
}

module.exports = ChatSidebarProvider;
