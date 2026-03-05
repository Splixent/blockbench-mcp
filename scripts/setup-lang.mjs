import { createInterface } from "node:readline";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, "..", ".langrc.json");

const LANGUAGES = {
  1: { code: "en", name: "English" },
  2: { code: "ko", name: "한국어 (Korean)" },
};

// Skip prompt if language is already configured
if (existsSync(configPath)) {
  try {
    const existing = JSON.parse(readFileSync(configPath, "utf-8"));
    if (existing.lang) {
      const langName = Object.values(LANGUAGES).find(l => l.code === existing.lang)?.name ?? existing.lang;
      console.log(`\n  Language already set to: ${langName}`);
      console.log(`  To change, delete .langrc.json and run "pnpm install" again.\n`);
      process.exit(0);
    }
  } catch {
    // corrupted file, re-prompt
  }
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log("\n  ┌─────────────────────────────────────┐");
console.log("  │   Blockbench MCP - Language Setup   │");
console.log("  └─────────────────────────────────────┘\n");
console.log("  Select your language / 언어를 선택하세요:\n");

for (const [num, lang] of Object.entries(LANGUAGES)) {
  console.log(`    ${num}) ${lang.name}`);
}
console.log();

function ask() {
  rl.question("  Enter number (1-2): ", (answer) => {
    const choice = LANGUAGES[Number(answer.trim())];
    if (!choice) {
      console.log("  Invalid choice. Please try again.\n");
      ask();
      return;
    }

    writeFileSync(configPath, JSON.stringify({ lang: choice.code }, null, 2) + "\n");
    console.log(`\n  Language set to: ${choice.name}`);
    console.log(`  Config saved to .langrc.json\n`);
    rl.close();
  });
}

ask();
