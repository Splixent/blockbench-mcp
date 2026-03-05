import { Server } from "socket.io";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
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

const PORT = 9999;
const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log(`[MCP] ${t("server.clientConnected")}`, socket.id);

  socket.on("client_ready", () => {
    console.log(`[MCP] ${t("server.clientCallTest")}`);
    const command: ToolCommand = {
      tool: "hello_world",
      input: {},
    };
    socket.emit("tool_command", command);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[MCP] ${t("server.started")} http://localhost:${PORT}`);
});
