// Register the plugin and define what it adds

import { io } from "socket.io-client";
import { ToolType } from "@shared/types";
import { setLang, t, SupportedLang } from "@shared/i18n";

declare const __LANG__: string;

// Set language from build-time config
setLang((__LANG__ || "en") as SupportedLang);

let mcpPanel: Panel;
let commandListElement: HTMLElement;
const commandHistory: Array<{ timestamp: Date; type: 'sent' | 'received'; command: string; data?: any }> = [];

const options: PluginOptions = {
  title: "MCP Plugin",
  author: "enfpdev",
  description: "A plugin for interacting with MCP using Socket.IO.",
  about:
    "This plugin allows you to connect to the MCP server using Socket.IO and provides various utilities for interacting with it.",
  version: "0.0.1",
  icon: "icon.png",
  tags: ["mcp", "ai", "agent"],
  variant: "desktop",
  await_loading: true,
  new_repository_format: true,
  website: "https://github.com/enfpdev/blockbench-mcp",
  repository: "https://github.com/enfpdev/blockbench-mcp",
  onload: () => {
    const socket = io("http://localhost:9999");

    const updateCommandDisplay = () => {
      if (!commandListElement) return;

      if (commandHistory.length === 0) {
        commandListElement.innerHTML = `<div class="mcp-empty">${t("commandHistory.empty")}</div>`;
        return;
      }

      const commandsHtml = commandHistory.map(entry => {
        const timeStr = entry.timestamp.toLocaleTimeString();
        const typeIcon = entry.type === 'sent' ? '↗️' : '↙️';
        const typeClass = entry.type === 'sent' ? 'mcp-sent' : 'mcp-received';
        const dataHtml = entry.data ?
          `<div class="mcp-data">${JSON.stringify(entry.data, null, 2)}</div>` : '';

        return `
          <div class="mcp-command-item ${typeClass}">
            <div class="mcp-time">${timeStr}</div>
            <div class="mcp-command">
              <span class="mcp-icon">${typeIcon}</span>
              <span class="mcp-name">${entry.command}</span>
            </div>
            ${dataHtml}
          </div>
        `;
      }).join('');

      commandListElement.innerHTML = commandsHtml;
      commandListElement.scrollTop = commandListElement.scrollHeight;
    };

    mcpPanel = new Panel({
      id: 'mcp_command_history',
      name: t("commandHistory.title"),
      icon: 'history',
      growable: true,
      resizable: true,
      expand_button: true,
      default_side: 'right',
      default_position: {
        slot: 'right_bar',
        float_position: [100, 100],
        float_size: [400, 500],
        height: 400,
        folded: false
      },
      component: {
        name: 'mcp-command-history',
        template: `
          <div class="mcp-command-history">
            <div class="mcp-header">
              <h3>${t("commandHistory.title")}</h3>
              <div class="mcp-stats">${t("commandHistory.stats", commandHistory.length)}</div>
            </div>
            <div class="mcp-content" ref="commandList">
              <div class="mcp-empty">${t("commandHistory.empty")}</div>
            </div>
          </div>
        `,
        mounted() {
          const refs = (this as any).$refs;
          if (refs && refs.commandList) {
            commandListElement = refs.commandList;
            updateCommandDisplay();
          }
        }
      }
    });

    const style = document.createElement('style');
    style.textContent = `
      .mcp-command-history {
        height: 100%;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      }
      .mcp-header {
        padding: 10px;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-ui);
      }
      .mcp-header h3 {
        margin: 0 0 5px 0;
        font-size: 14px;
        font-weight: 600;
      }
      .mcp-stats {
        font-size: 11px;
        color: var(--color-subtle_text);
      }
      .mcp-content {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
      }
      .mcp-empty {
        text-align: center;
        color: var(--color-subtle_text);
        font-style: italic;
        padding: 20px;
      }
      .mcp-command-item {
        margin-bottom: 12px;
        padding: 8px;
        border-radius: 4px;
        border-left: 3px solid transparent;
        background: var(--color-ui);
      }
      .mcp-command-item.mcp-sent {
        border-left-color: #4CAF50;
        background: rgba(76, 175, 80, 0.1);
      }
      .mcp-command-item.mcp-received {
        border-left-color: #2196F3;
        background: rgba(33, 150, 243, 0.1);
      }
      .mcp-time {
        font-size: 10px;
        color: var(--color-subtle_text);
        margin-bottom: 4px;
      }
      .mcp-command {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .mcp-icon {
        font-size: 12px;
      }
      .mcp-name {
        font-weight: 600;
        font-size: 12px;
      }
      .mcp-data {
        margin-top: 4px;
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 10px;
        background: rgba(0, 0, 0, 0.1);
        padding: 4px 6px;
        border-radius: 2px;
        white-space: pre-wrap;
        max-height: 100px;
        overflow-y: auto;
      }
    `;
    document.head.appendChild(style);

    new Action('mcp_toggle_panel', {
      name: t("commandHistory.togglePanel"),
      icon: 'history',
      click: () => {
        const panelElement = document.getElementById('panel_mcp_command_history');
        if (panelElement) {
          const isVisible = panelElement.style.display !== 'none';
          panelElement.style.display = isVisible ? 'none' : 'block';
        }
      }
    });

    const updateCommandHistory = () => {
      updateCommandDisplay();
      const statsElement = document.querySelector('.mcp-stats');
      if (statsElement) {
        statsElement.textContent = t("commandHistory.stats", commandHistory.length);
      }
    };

    socket.on("connect", () => {
      console.log(`[MCP Plugin] ${t("plugin.connected")}`);
      commandHistory.push({
        timestamp: new Date(),
        type: 'sent',
        command: 'client_ready'
      });
      socket.emit("client_ready");
      updateCommandHistory();
    });

    socket.on("tool_command", (cmd: { tool: ToolType; input: any }) => {
      commandHistory.push({
        timestamp: new Date(),
        type: 'received',
        command: 'tool_command',
        data: cmd
      });

      if (cmd.tool === "hello_world") {
        Blockbench.showStatusMessage(
          `[MCP] Hello, ${cmd.input.name || "World"}!`,
          5000
        );
      }
      updateCommandHistory();
    });

    const originalEmit = socket.emit;
    socket.emit = function(event: string, ...args: any[]) {
      commandHistory.push({
        timestamp: new Date(),
        type: 'sent',
        command: event,
        data: args.length > 0 ? args : undefined
      });
      updateCommandHistory();
      return originalEmit.call(this, event, ...args);
    };

    setInterval(() => {
      if (commandHistory.length > 0) {
        updateCommandHistory();
      }
    }, 10000);
  },
  onunload: () => {
    if (BarItems.mcp_toggle_panel) {
      BarItems.mcp_toggle_panel.delete();
    }
    if (mcpPanel) {
      mcpPanel.delete();
    }
  },
  oninstall: () => {},
  onuninstall: () => {},
};

(function () {
  BBPlugin.register("mcp_socketio_plugin", options);
})();
