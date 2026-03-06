"use strict";

// src/index.ts
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_socket = require("socket.io");
var import_http = require("http");
var import_fs = require("fs");
var import_path = require("path");
var import_zod = require("zod");

// ../../packages/shared/src/i18n/locales/en.ts
var en = {
  // Plugin UI
  "commandHistory.empty": "No command history yet.",
  "commandHistory.title": "MCP Command History",
  "commandHistory.stats": (count) => `Total ${count} commands`,
  "commandHistory.togglePanel": "Toggle MCP Command Panel",
  "plugin.connected": "Connected",
  "plugin.connect": "Connect to MCP Server",
  "plugin.disconnect": "Disconnect",
  "plugin.status.disconnected": "Disconnected",
  "plugin.status.connecting": "Connecting...",
  "plugin.status.connected": "Connected to MCP Server",
  // Server logs
  "server.clientConnected": "Client connected:",
  "server.clientCallTest": "Client call test",
  "server.started": "Server started:"
};

// ../../packages/shared/src/i18n/locales/ko.ts
var ko = {
  // Plugin UI
  "commandHistory.empty": "\uC544\uC9C1 \uCEE4\uB9E8\uB4DC \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  "commandHistory.title": "MCP \uCEE4\uB9E8\uB4DC \uAE30\uB85D",
  "commandHistory.stats": (count) => `\uCD1D ${count}\uAC1C \uCEE4\uB9E8\uB4DC`,
  "commandHistory.togglePanel": "MCP \uCEE4\uB9E8\uB4DC \uD328\uB110 \uD1A0\uAE00",
  "plugin.connected": "\uC5F0\uACB0\uB428",
  "plugin.connect": "MCP \uC11C\uBC84 \uC5F0\uACB0",
  "plugin.disconnect": "\uC5F0\uACB0 \uD574\uC81C",
  "plugin.status.disconnected": "\uC5F0\uACB0 \uD574\uC81C\uB428",
  "plugin.status.connecting": "\uC5F0\uACB0 \uC911...",
  "plugin.status.connected": "MCP \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uB428",
  // Server logs
  "server.clientConnected": "\uD074\uB77C\uC774\uC5B8\uD2B8 \uC5F0\uACB0\uB428:",
  "server.clientCallTest": "\uD074\uB77C\uC774\uC5B8\uD2B8 \uD638\uCD9C \uD14C\uC2A4\uD2B8",
  "server.started": "\uC11C\uBC84 \uC2DC\uC791:"
};

// ../../packages/shared/src/i18n/index.ts
var locales = { en, ko };
var currentLang = "en";
function setLang(lang) {
  currentLang = lang;
}
function t(key, ...args) {
  const value = locales[currentLang][key];
  if (typeof value === "function") {
    return value(...args);
  }
  return value;
}

// src/index.ts
var configPath = (0, import_path.resolve)(__dirname, "../../../.langrc.json");
if ((0, import_fs.existsSync)(configPath)) {
  try {
    const config = JSON.parse((0, import_fs.readFileSync)(configPath, "utf-8"));
    if (config.lang) setLang(config.lang);
  } catch {
  }
}
var PORT = parseInt(process.env.BLOCKBENCH_MCP_PORT || "9999", 10);
function handleHttpRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "POST" && req.url === "/api/tool") {
    let body = "";
    req.on("data", (chunk) => body += chunk.toString());
    req.on("end", async () => {
      try {
        const command = JSON.parse(body);
        const result = await sendToBlockbench(command);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        blockbenchConnected: blockbenchSocket !== null
      })
    );
    return;
  }
  res.writeHead(404);
  res.end();
}
var httpServer = (0, import_http.createServer)(handleHttpRequest);
var io = new import_socket.Server(httpServer, { cors: { origin: "*" } });
var blockbenchSocket = null;
var pendingRequests = /* @__PURE__ */ new Map();
io.on("connection", (socket) => {
  console.error(`[MCP] ${t("server.clientConnected")} ${socket.id}`);
  blockbenchSocket = socket;
  socket.on("disconnect", () => {
    if (blockbenchSocket?.id === socket.id) {
      blockbenchSocket = null;
    }
    console.error("[MCP] Blockbench disconnected");
  });
  socket.on("client_ready", () => {
    console.error(`[MCP] ${t("server.clientCallTest")}`);
  });
  socket.on("tool_response", (response) => {
    const pending = pendingRequests.get(response.requestId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(response.requestId);
      pending.resolve(response.result);
    }
  });
});
httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[MCP] Port ${PORT} already in use (another MCP instance running?). MCP tools available via stdio but Socket.IO bridge is disabled.`
    );
  } else {
    console.error(`[MCP] HTTP server error: ${err.message}`);
  }
});
httpServer.listen(PORT, () => {
  console.error(`[MCP] ${t("server.started")} http://localhost:${PORT}`);
});
function sendToBlockbench(command) {
  return new Promise((resolve2, reject) => {
    if (!blockbenchSocket) {
      reject(
        new Error(
          "Blockbench is not connected. Open Blockbench and click 'Connect to MCP Server' in the MCP panel."
        )
      );
      return;
    }
    const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Blockbench did not respond within 30 seconds."));
    }, 3e4);
    pendingRequests.set(requestId, { resolve: resolve2, timer });
    blockbenchSocket.emit("tool_command", {
      ...command,
      requestId
    });
  });
}
var mcp = new import_mcp.McpServer({
  name: "blockbench-mcp",
  version: "0.0.1"
});
function createToolHandler(toolName) {
  return async (input) => {
    try {
      const result = await sendToBlockbench({ tool: toolName, input });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: err.message }],
        isError: true
      };
    }
  };
}
mcp.registerTool(
  "hello_world",
  {
    description: "Display a hello message in Blockbench's status bar",
    inputSchema: { name: import_zod.z.string().describe("Name to greet") }
  },
  async ({ name }) => createToolHandler("hello_world")({ name })
);
mcp.registerTool(
  "get_project_data",
  {
    description: "Get the current Blockbench project data including all elements (cubes), groups (bones), and their properties (positions, sizes, rotations). Returns the full outliner tree structure.",
    inputSchema: {}
  },
  async () => createToolHandler("get_project_data")({})
);
mcp.registerTool(
  "add_cube",
  {
    description: "Add a new cube element to the Blockbench model. Cubes are defined by 'from' (min corner) and 'to' (max corner) coordinates.",
    inputSchema: {
      name: import_zod.z.string().describe("Name for the cube"),
      from: import_zod.z.array(import_zod.z.number()).length(3).describe("Start position [x, y, z] - minimum corner"),
      to: import_zod.z.array(import_zod.z.number()).length(3).describe("End position [x, y, z] - maximum corner"),
      rotation: import_zod.z.array(import_zod.z.number()).length(3).optional().describe("Rotation [rx, ry, rz] in degrees"),
      origin: import_zod.z.array(import_zod.z.number()).length(3).optional().describe("Rotation origin/pivot point [x, y, z]"),
      group: import_zod.z.string().optional().describe("UUID of parent group to add cube into"),
      inflate: import_zod.z.number().optional().describe("Inflate/deflate amount")
    }
  },
  async (input) => createToolHandler("add_cube")(input)
);
mcp.registerTool(
  "add_group",
  {
    description: "Add a new group (bone) to the Blockbench model for organizing elements hierarchically.",
    inputSchema: {
      name: import_zod.z.string().describe("Name for the group/bone"),
      origin: import_zod.z.array(import_zod.z.number()).length(3).optional().describe("Group origin/pivot [x, y, z]"),
      rotation: import_zod.z.array(import_zod.z.number()).length(3).optional().describe("Group rotation [rx, ry, rz] in degrees"),
      parent: import_zod.z.string().optional().describe("UUID of parent group to nest under")
    }
  },
  async (input) => createToolHandler("add_group")(input)
);
mcp.registerTool(
  "modify_element",
  {
    description: "Modify properties of an existing cube or group by UUID. Only provided properties will be changed.",
    inputSchema: {
      uuid: import_zod.z.string().describe("UUID of the element to modify"),
      name: import_zod.z.string().optional().describe("New name"),
      from: import_zod.z.array(import_zod.z.number()).length(3).optional().describe("New start position [x, y, z] (cubes only)"),
      to: import_zod.z.array(import_zod.z.number()).length(3).optional().describe("New end position [x, y, z] (cubes only)"),
      rotation: import_zod.z.array(import_zod.z.number()).length(3).optional().describe("New rotation [rx, ry, rz] in degrees"),
      origin: import_zod.z.array(import_zod.z.number()).length(3).optional().describe("New rotation origin [x, y, z]"),
      inflate: import_zod.z.number().optional().describe("New inflate amount (cubes only)"),
      visibility: import_zod.z.boolean().optional().describe("Show/hide element")
    }
  },
  async (input) => createToolHandler("modify_element")(input)
);
mcp.registerTool(
  "remove_element",
  {
    description: "Remove an element (cube or group) from the model by UUID.",
    inputSchema: {
      uuid: import_zod.z.string().describe("UUID of the element to remove")
    }
  },
  async (input) => createToolHandler("remove_element")(input)
);
mcp.registerTool(
  "run_expression",
  {
    description: "Execute arbitrary JavaScript code in the Blockbench context. Has access to all Blockbench APIs (Cube, Group, Outliner, Canvas, Project, Format, Undo, etc). Use for complex operations not covered by other tools. Return values are serialized as strings.",
    inputSchema: {
      code: import_zod.z.string().describe("JavaScript code to execute in Blockbench context")
    }
  },
  async (input) => createToolHandler("run_expression")(input)
);
(async () => {
  const transport = new import_stdio.StdioServerTransport();
  await mcp.connect(transport);
})();
