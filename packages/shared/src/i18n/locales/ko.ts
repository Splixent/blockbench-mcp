export const ko = {
  // Plugin UI
  "commandHistory.empty": "아직 커맨드 기록이 없습니다.",
  "commandHistory.title": "MCP 커맨드 기록",
  "commandHistory.stats": (count: number) => `총 ${count}개 커맨드`,
  "commandHistory.togglePanel": "MCP 커맨드 패널 토글",
  "plugin.connected": "연결됨",
  "plugin.connect": "MCP 서버 연결",
  "plugin.disconnect": "연결 해제",
  "plugin.status.disconnected": "연결 해제됨",
  "plugin.status.connecting": "연결 중...",
  "plugin.status.connected": "MCP 서버에 연결됨",

  // Server logs
  "server.clientConnected": "클라이언트 연결됨:",
  "server.clientCallTest": "클라이언트 호출 테스트",
  "server.started": "서버 시작:",
} as const;
