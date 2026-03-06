import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server as SocketServer } from "socket.io";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { z } from "zod";
import type { ToolCommand } from "@shared/types";
import { setLang, t, SupportedLang } from "@shared/i18n";

// Load language from config
const configPath = resolve(__dirname, "../../../.langrc.json");
if (existsSync(configPath)) {
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.lang) setLang(config.lang as SupportedLang);
  } catch {
    // use default (en)
  }
}

// ── Socket.IO server (port 9999) ──────────────────────────────────────────────
// Blockbench plugin connects here. All logging goes to stderr so it doesn't
// interfere with the MCP stdio protocol on stdout.

const PORT = parseInt(process.env.BLOCKBENCH_MCP_PORT || "9999", 10);

// HTTP request handler for the REST API
function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  // CORS headers
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
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", async () => {
      try {
        const command: ToolCommand = JSON.parse(body);
        const result = await sendToBlockbench(command);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        blockbenchConnected: blockbenchSocket !== null,
      })
    );
    return;
  }

  res.writeHead(404);
  res.end();
}

const httpServer = createServer(handleHttpRequest);
const io = new SocketServer(httpServer, { cors: { origin: "*" } });

let blockbenchSocket: ReturnType<
  typeof io.sockets.sockets.values
> extends IterableIterator<infer S>
  ? S
  : never | null = null as any;

// Pending request tracking for request-response pattern
const pendingRequests = new Map<
  string,
  { resolve: (value: any) => void; timer: ReturnType<typeof setTimeout> }
>();

io.on("connection", (socket) => {
  console.error(`[MCP] ${t("server.clientConnected")} ${socket.id}`);
  blockbenchSocket = socket as any;

  socket.on("disconnect", () => {
    if ((blockbenchSocket as any)?.id === socket.id) {
      blockbenchSocket = null as any;
    }
    console.error("[MCP] Blockbench disconnected");
  });

  socket.on("client_ready", () => {
    console.error(`[MCP] ${t("server.clientCallTest")}`);
  });

  // Handle responses from Blockbench plugin
  socket.on("tool_response", (response: { requestId: string; result: any }) => {
    const pending = pendingRequests.get(response.requestId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(response.requestId);
      pending.resolve(response.result);
    }
  });
});

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[MCP] Port ${PORT} already in use (another MCP instance running?). ` +
        `MCP tools available via stdio but Socket.IO bridge is disabled.`
    );
  } else {
    console.error(`[MCP] HTTP server error: ${err.message}`);
  }
});

httpServer.listen(PORT, () => {
  console.error(`[MCP] ${t("server.started")} http://localhost:${PORT}`);
});

// ── Helper: send command to Blockbench and wait for response ─────────────────

function sendToBlockbench(command: ToolCommand): Promise<any> {
  return new Promise((resolve, reject) => {
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
    }, 30000);

    pendingRequests.set(requestId, { resolve, timer });
    (blockbenchSocket as any).emit("tool_command", {
      ...command,
      requestId,
    });
  });
}

// ── MCP Server (stdio) ────────────────────────────────────────────────────────
// Claude connects here via stdio. Tool calls are bridged to Blockbench.

const mcp = new McpServer({
  name: "blockbench-mcp",
  version: "0.0.1",
});

// Helper to create tool handlers with error handling
function createToolHandler(toolName: string) {
  return async (input: Record<string, any>) => {
    try {
      const result = await sendToBlockbench({ tool: toolName as any, input });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: err.message }],
        isError: true,
      };
    }
  };
}

// ── Tool: hello_world ────────────────────────────────────────────────────────

mcp.registerTool(
  "hello_world",
  {
    description: "Display a hello message in Blockbench's status bar",
    inputSchema: { name: z.string().describe("Name to greet") },
  },
  async ({ name }) => createToolHandler("hello_world")({ name })
);

// ── Tool: get_project_data ───────────────────────────────────────────────────

mcp.registerTool(
  "get_project_data",
  {
    description:
      "Get the current Blockbench project data including all elements (cubes), groups (bones), and their properties (positions, sizes, rotations). Returns the full outliner tree structure.",
    inputSchema: {},
  },
  async () => createToolHandler("get_project_data")({})
);

// ── Tool: add_cube ───────────────────────────────────────────────────────────

mcp.registerTool(
  "add_cube",
  {
    description:
      "Add a new cube element to the Blockbench model. Cubes are defined by 'from' (min corner) and 'to' (max corner) coordinates.",
    inputSchema: {
      name: z.string().describe("Name for the cube"),
      from: z
        .array(z.number())
        .length(3)
        .describe("Start position [x, y, z] - minimum corner"),
      to: z
        .array(z.number())
        .length(3)
        .describe("End position [x, y, z] - maximum corner"),
      rotation: z
        .array(z.number())
        .length(3)
        .optional()
        .describe("Rotation [rx, ry, rz] in degrees"),
      origin: z
        .array(z.number())
        .length(3)
        .optional()
        .describe("Rotation origin/pivot point [x, y, z]"),
      group: z
        .string()
        .optional()
        .describe("UUID of parent group to add cube into"),
      inflate: z.number().optional().describe("Inflate/deflate amount"),
    },
  },
  async (input) => createToolHandler("add_cube")(input)
);

// ── Tool: add_group ──────────────────────────────────────────────────────────

mcp.registerTool(
  "add_group",
  {
    description:
      "Add a new group (bone) to the Blockbench model for organizing elements hierarchically.",
    inputSchema: {
      name: z.string().describe("Name for the group/bone"),
      origin: z
        .array(z.number())
        .length(3)
        .optional()
        .describe("Group origin/pivot [x, y, z]"),
      rotation: z
        .array(z.number())
        .length(3)
        .optional()
        .describe("Group rotation [rx, ry, rz] in degrees"),
      parent: z
        .string()
        .optional()
        .describe("UUID of parent group to nest under"),
    },
  },
  async (input) => createToolHandler("add_group")(input)
);

// ── Tool: modify_element ─────────────────────────────────────────────────────

mcp.registerTool(
  "modify_element",
  {
    description:
      "Modify properties of an existing cube or group by UUID. Only provided properties will be changed.",
    inputSchema: {
      uuid: z.string().describe("UUID of the element to modify"),
      name: z.string().optional().describe("New name"),
      from: z
        .array(z.number())
        .length(3)
        .optional()
        .describe("New start position [x, y, z] (cubes only)"),
      to: z
        .array(z.number())
        .length(3)
        .optional()
        .describe("New end position [x, y, z] (cubes only)"),
      rotation: z
        .array(z.number())
        .length(3)
        .optional()
        .describe("New rotation [rx, ry, rz] in degrees"),
      origin: z
        .array(z.number())
        .length(3)
        .optional()
        .describe("New rotation origin [x, y, z]"),
      inflate: z
        .number()
        .optional()
        .describe("New inflate amount (cubes only)"),
      visibility: z.boolean().optional().describe("Show/hide element"),
    },
  },
  async (input) => createToolHandler("modify_element")(input)
);

// ── Tool: remove_element ─────────────────────────────────────────────────────

mcp.registerTool(
  "remove_element",
  {
    description: "Remove an element (cube or group) from the model by UUID.",
    inputSchema: {
      uuid: z.string().describe("UUID of the element to remove"),
    },
  },
  async (input) => createToolHandler("remove_element")(input)
);

// ── Tool: run_expression ─────────────────────────────────────────────────────

mcp.registerTool(
  "run_expression",
  {
    description:
      "Execute arbitrary JavaScript code in the Blockbench context. Has access to all Blockbench APIs (Cube, Group, Outliner, Canvas, Project, Format, Undo, etc). Use for complex operations not covered by other tools. Return values are serialized as strings.",
    inputSchema: {
      code: z
        .string()
        .describe("JavaScript code to execute in Blockbench context"),
    },
  },
  async (input) => createToolHandler("run_expression")(input)
);

// ── Start MCP server ─────────────────────────────────────────────────────────

(async () => {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
})();
