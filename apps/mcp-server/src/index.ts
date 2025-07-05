import { Server } from "socket.io";
import { createServer } from "http";
import type { ToolCommand } from "@shared/types";

const PORT = 9999;
const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("[MCP] 클라이언트 연결됨:", socket.id);

  socket.on("client_ready", () => {
    console.log("[MCP] 클라이언트 호출 테스트");
    const command: ToolCommand = {
      tool: "hello_world",
      input: {},
    };
    socket.emit("tool_command", command);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[MCP] 서버 시작: http://localhost:${PORT}`);
});
