import { io, Socket } from "socket.io-client";
import { ToolType } from "@shared/types";
import { setLang, t, SupportedLang } from "@shared/i18n";

declare const __LANG__: string;

setLang((__LANG__ || "en") as SupportedLang);

let mcpPanel: Panel;
let commandListElement: HTMLElement | null = null;
let statusElement: HTMLElement | null = null;
let connectBtnElement: HTMLElement | null = null;
let socket: Socket | null = null;

const commandHistory: Array<{ timestamp: Date; type: 'sent' | 'received'; command: string; data?: any }> = [];

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

const updateCommandHistory = () => {
  updateCommandDisplay();
  const statsElement = document.querySelector('.mcp-stats');
  if (statsElement) {
    statsElement.textContent = t("commandHistory.stats", commandHistory.length);
  }
};

function setStatus(state: 'disconnected' | 'connecting' | 'connected') {
  if (!statusElement || !connectBtnElement) return;

  statusElement.className = `mcp-status mcp-status-${state}`;

  if (state === 'disconnected') {
    statusElement.textContent = `○ ${t("plugin.status.disconnected")}`;
    connectBtnElement.textContent = t("plugin.connect");
    connectBtnElement.removeAttribute('disabled');
  } else if (state === 'connecting') {
    statusElement.textContent = `◌ ${t("plugin.status.connecting")}`;
    connectBtnElement.textContent = t("plugin.status.connecting");
    connectBtnElement.setAttribute('disabled', 'true');
  } else {
    statusElement.textContent = `● ${t("plugin.status.connected")}`;
    connectBtnElement.textContent = t("plugin.disconnect");
    connectBtnElement.removeAttribute('disabled');
  }
}

function disconnectFromServer() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  setStatus('disconnected');
}

// ── Tool handlers ────────────────────────────────────────────────────────────

function serializeNode(node: any): any {
  if (node instanceof Cube) {
    return {
      type: 'cube',
      uuid: node.uuid,
      name: node.name,
      from: Array.from(node.from),
      to: Array.from(node.to),
      size: [
        node.to[0] - node.from[0],
        node.to[1] - node.from[1],
        node.to[2] - node.from[2],
      ],
      rotation: node.rotation ? Array.from(node.rotation) : [0, 0, 0],
      origin: Array.from(node.origin),
      inflate: node.inflate || 0,
      visibility: node.visibility,
    };
  } else if (node instanceof Group) {
    return {
      type: 'group',
      uuid: node.uuid,
      name: node.name,
      origin: Array.from(node.origin),
      rotation: node.rotation ? Array.from(node.rotation) : [0, 0, 0],
      visibility: node.visibility,
      children: node.children
        .map((child: any) => serializeNode(child))
        .filter(Boolean),
    };
  }
  return null;
}

function handleGetProjectData(): any {
  return {
    name: (Project as any)?.name || 'Untitled',
    format: (Format as any)?.id || 'unknown',
    texture_width: (Project as any)?.texture_width || 16,
    texture_height: (Project as any)?.texture_height || 16,
    elements_count: Cube.all?.length || 0,
    groups_count: Group.all?.length || 0,
    outliner: Outliner.root
      .map((node: any) => serializeNode(node))
      .filter(Boolean),
  };
}

function handleAddCube(input: any): any {
  const cubeData: any = {
    name: input.name || 'New Cube',
    from: input.from || [0, 0, 0],
    to: input.to || [1, 1, 1],
  };
  if (input.rotation) cubeData.rotation = input.rotation;
  if (input.origin) cubeData.origin = input.origin;
  if (input.inflate !== undefined) cubeData.inflate = input.inflate;

  Undo.initEdit({ outliner: true, elements: [] });

  const cube = new Cube(cubeData);

  if (input.group) {
    const group = Group.all.find((g: any) => g.uuid === input.group);
    if (group) {
      cube.addTo(group);
    } else {
      cube.init();
    }
  } else {
    cube.init();
  }

  Undo.finishEdit('MCP: add cube');
  Canvas.updateAll();

  return {
    success: true,
    uuid: cube.uuid,
    name: cube.name,
    from: Array.from(cube.from),
    to: Array.from(cube.to),
  };
}

function handleAddGroup(input: any): any {
  Undo.initEdit({ outliner: true });

  const group = new Group({
    name: input.name || 'New Group',
    origin: input.origin || [0, 0, 0],
    rotation: input.rotation || [0, 0, 0],
  });

  if (input.parent) {
    const parentGroup = Group.all.find((g: any) => g.uuid === input.parent);
    if (parentGroup) {
      group.addTo(parentGroup);
    } else {
      group.init();
    }
  } else {
    group.init();
  }

  Undo.finishEdit('MCP: add group');

  return {
    success: true,
    uuid: group.uuid,
    name: group.name,
    origin: Array.from(group.origin),
  };
}

function handleModifyElement(input: any): any {
  const { uuid, ...properties } = input;

  // Find element by UUID (cube or group)
  const cube = Cube.all.find((c: any) => c.uuid === uuid);
  const group = !cube ? Group.all.find((g: any) => g.uuid === uuid) : null;
  const element: any = cube || group;

  if (!element) {
    return { error: `Element not found with UUID: ${uuid}` };
  }

  const isCube = element instanceof Cube;

  Undo.initEdit({
    elements: isCube ? [element] : [],
    outliner: !isCube,
  });

  if (properties.name !== undefined) element.name = properties.name;
  if (properties.origin) element.origin = properties.origin;
  if (properties.rotation) element.rotation = properties.rotation;
  if (properties.visibility !== undefined)
    element.visibility = properties.visibility;

  if (isCube) {
    if (properties.from) element.from = properties.from;
    if (properties.to) element.to = properties.to;
    if (properties.inflate !== undefined)
      element.inflate = properties.inflate;
  }

  Undo.finishEdit('MCP: modify element');
  Canvas.updateAll();

  const result: any = {
    success: true,
    uuid: element.uuid,
    name: element.name,
    type: isCube ? 'cube' : 'group',
  };

  if (isCube) {
    result.from = Array.from(element.from);
    result.to = Array.from(element.to);
    result.size = [
      element.to[0] - element.from[0],
      element.to[1] - element.from[1],
      element.to[2] - element.from[2],
    ];
  }

  return result;
}

function handleRemoveElement(input: any): any {
  const cube = Cube.all.find((c: any) => c.uuid === input.uuid);
  const group = !cube
    ? Group.all.find((g: any) => g.uuid === input.uuid)
    : null;
  const element: any = cube || group;

  if (!element) {
    return { error: `Element not found with UUID: ${input.uuid}` };
  }

  const name = element.name;
  const type = element instanceof Cube ? 'cube' : 'group';

  Undo.initEdit({
    elements: cube ? [element] : [],
    outliner: true,
  });

  element.remove();

  Undo.finishEdit('MCP: remove element');
  Canvas.updateAll();

  return { success: true, removed: name, type };
}

function handleRunExpression(input: any): any {
  try {
    const result = eval(input.code);
    // Try to serialize the result
    if (result === undefined) {
      return { success: true, result: 'undefined' };
    }
    try {
      const serialized = JSON.parse(JSON.stringify(result));
      return { success: true, result: serialized };
    } catch {
      return { success: true, result: String(result) };
    }
  } catch (err: any) {
    return { error: err.message, stack: err.stack };
  }
}

function handleToolCommand(cmd: { tool: ToolType; input: any }): any {
  switch (cmd.tool) {
    case 'hello_world':
      Blockbench.showStatusMessage(
        `[MCP] Hello, ${cmd.input.name || 'World'}!`,
        5000
      );
      return { success: true, message: `Greeted ${cmd.input.name}` };

    case 'get_project_data':
      return handleGetProjectData();

    case 'add_cube':
      return handleAddCube(cmd.input);

    case 'add_group':
      return handleAddGroup(cmd.input);

    case 'modify_element':
      return handleModifyElement(cmd.input);

    case 'remove_element':
      return handleRemoveElement(cmd.input);

    case 'run_expression':
      return handleRunExpression(cmd.input);

    default:
      return { error: `Unknown tool: ${cmd.tool}` };
  }
}

// ── Socket connection ────────────────────────────────────────────────────────

function connectToServer() {
  if (socket) return;

  setStatus('connecting');

  socket = io("http://localhost:9999", { reconnection: false });

  // Intercept emits to record in history
  const originalEmit = socket.emit.bind(socket);
  socket.emit = function(event: string, ...args: any[]) {
    commandHistory.push({
      timestamp: new Date(),
      type: 'sent',
      command: event,
      data: args.length > 0 ? args : undefined
    });
    updateCommandHistory();
    return originalEmit(event, ...args);
  };

  socket.on("connect", () => {
    console.log(`[MCP Plugin] ${t("plugin.connected")}`);
    setStatus('connected');
    socket!.emit("client_ready");
    updateCommandHistory();
  });

  socket.on("connect_error", () => {
    socket = null;
    setStatus('disconnected');
    Blockbench.showMessageBox({
      title: "MCP Plugin",
      message: "Could not connect to MCP server at localhost:9999.\nMake sure the server is running.",
      buttons: ["OK"]
    });
  });

  socket.on("disconnect", () => {
    socket = null;
    setStatus('disconnected');
  });

  socket.on("tool_command", (cmd: { tool: ToolType; input: any; requestId?: string }) => {
    commandHistory.push({
      timestamp: new Date(),
      type: 'received',
      command: `tool: ${cmd.tool}`,
      data: cmd
    });

    let result: any;
    try {
      result = handleToolCommand(cmd);
    } catch (err: any) {
      result = { error: err.message };
    }

    // Send response back via tool_response event
    if (cmd.requestId && socket) {
      socket.emit("tool_response", { requestId: cmd.requestId, result });
    }

    updateCommandHistory();
  });
}

// ── Plugin registration ──────────────────────────────────────────────────────

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
              <div class="mcp-stats">${t("commandHistory.stats", 0)}</div>
            </div>
            <div class="mcp-connect-area">
              <div class="mcp-status mcp-status-disconnected" ref="status">○ ${t("plugin.status.disconnected")}</div>
              <button class="mcp-connect-btn" ref="connectBtn">${t("plugin.connect")}</button>
            </div>
            <div class="mcp-content" ref="commandList">
              <div class="mcp-empty">${t("commandHistory.empty")}</div>
            </div>
          </div>
        `,
        mounted() {
          const refs = (this as any).$refs;
          if (refs.commandList) {
            commandListElement = refs.commandList;
            updateCommandDisplay();
          }
          if (refs.status) {
            statusElement = refs.status;
          }
          if (refs.connectBtn) {
            connectBtnElement = refs.connectBtn;
            connectBtnElement!.addEventListener('click', () => {
              if (socket) {
                disconnectFromServer();
              } else {
                connectToServer();
              }
            });
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
      .mcp-connect-area {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-ui);
        gap: 8px;
      }
      .mcp-status {
        font-size: 11px;
        font-weight: 500;
      }
      .mcp-status-disconnected { color: var(--color-subtle_text); }
      .mcp-status-connecting { color: #FF9800; }
      .mcp-status-connected { color: #4CAF50; }
      .mcp-connect-btn {
        font-size: 11px;
        padding: 4px 10px;
        border-radius: 3px;
        border: 1px solid var(--color-border);
        background: var(--color-button);
        color: var(--color-text);
        cursor: pointer;
        white-space: nowrap;
      }
      .mcp-connect-btn:hover:not([disabled]) { background: var(--color-accent); color: #fff; }
      .mcp-connect-btn[disabled] { opacity: 0.5; cursor: default; }
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
      .mcp-icon { font-size: 12px; }
      .mcp-name { font-weight: 600; font-size: 12px; }
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
  },
  onunload: () => {
    disconnectFromServer();
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
