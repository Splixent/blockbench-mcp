import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const serverEntry = resolve(projectRoot, "apps/mcp-server/dist/index.js");

// Locate Claude desktop config based on platform
function getClaudeConfigPath() {
  switch (platform()) {
    case "darwin":
      return resolve(homedir(), "Library/Application Support/Claude/claude_desktop_config.json");
    case "win32":
      return resolve(process.env.APPDATA ?? homedir(), "Claude/claude_desktop_config.json");
    default:
      return resolve(homedir(), ".config/claude/claude_desktop_config.json");
  }
}

const configPath = getClaudeConfigPath();

// Read existing config or start with empty object
let config = {};
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    console.error(`  Warning: Could not parse existing config at ${configPath}. It will be updated.`);
  }
}

// Inject/update blockbench MCP server entry
config.mcpServers ??= {};
config.mcpServers.blockbench = {
  command: "node",
  args: [serverEntry],
};

// Ensure the config directory exists
mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

console.log("\n  ✓ Claude MCP config updated:");
console.log(`    ${configPath}\n`);
console.log(`  Server path set to:`);
console.log(`    ${serverEntry}\n`);
console.log("  Restart Claude for changes to take effect.\n");
