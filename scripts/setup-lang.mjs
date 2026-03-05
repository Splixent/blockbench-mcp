import { createInterface } from "node:readline";
import { writeFileSync, existsSync, readFileSync, openSync } from "node:fs";
import { ReadStream, WriteStream } from "node:tty";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, "..", ".langrc.json");

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "ko", name: "한국어 (Korean)" },
];

// Skip prompt if language is already configured
if (existsSync(configPath)) {
  try {
    const existing = JSON.parse(readFileSync(configPath, "utf-8"));
    if (existing.lang) {
      const langName = LANGUAGES.find(l => l.code === existing.lang)?.name ?? existing.lang;
      console.log(`\n  Language already set to: ${langName}`);
      console.log(`  To change, delete .langrc.json and run "pnpm install" again.\n`);
      process.exit(0);
    }
  } catch {
    // corrupted file, re-prompt
  }
}

function saveAndExit(choice) {
  writeFileSync(configPath, JSON.stringify({ lang: choice.code }, null, 2) + "\n");
  console.log(`\n  Language set to: ${choice.name}`);
  console.log(`  Config saved to .langrc.json\n`);
  process.exit(0);
}

// Try to open /dev/tty directly so arrow keys work even when stdin is piped (e.g. pnpm postinstall)
function openTTY() {
  try {
    const fd = openSync("/dev/tty", "r+");
    return { stdin: new ReadStream(fd), stdout: new WriteStream(fd) };
  } catch {
    return null;
  }
}

function selectLanguageArrow(ttyIn, ttyOut) {
  let selectedIndex = 0;

  function render(isInitial) {
    if (!isInitial) {
      ttyOut.write(`\x1b[${LANGUAGES.length}A`);
    }
    for (let i = 0; i < LANGUAGES.length; i++) {
      const indicator = i === selectedIndex ? "❯" : " ";
      const color = i === selectedIndex ? "\x1b[36m" : "\x1b[90m";
      ttyOut.write(`\x1b[2K    ${color}${indicator} ${LANGUAGES[i].name}\x1b[0m\n`);
    }
  }

  ttyOut.write("\n  ┌─────────────────────────────────────┐\n");
  ttyOut.write("  │   Blockbench MCP - Language Setup   │\n");
  ttyOut.write("  └─────────────────────────────────────┘\n\n");
  ttyOut.write("  Select your language / 언어를 선택하세요:\n");
  ttyOut.write("  (Use \x1b[1m↑↓\x1b[0m arrow keys, press \x1b[1mEnter\x1b[0m to confirm)\n\n");
  render(true);

  ttyIn.setRawMode(true);
  ttyIn.resume();
  ttyIn.setEncoding("utf8");

  ttyIn.on("data", (key) => {
    if (key === "\x03") {
      ttyOut.write("\x1b[0m\n");
      process.exit(1);
    }
    if (key === "\x1b[A") {
      selectedIndex = (selectedIndex - 1 + LANGUAGES.length) % LANGUAGES.length;
      render(false);
    } else if (key === "\x1b[B") {
      selectedIndex = (selectedIndex + 1) % LANGUAGES.length;
      render(false);
    } else if (key === "\r" || key === "\n") {
      ttyIn.setRawMode(false);
      ttyIn.pause();
      saveAndExit(LANGUAGES[selectedIndex]);
    }
  });
}

// Number-based fallback for environments with no TTY at all (e.g. CI)
function selectLanguageFallback() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n  ┌─────────────────────────────────────┐");
  console.log("  │   Blockbench MCP - Language Setup   │");
  console.log("  └─────────────────────────────────────┘\n");
  console.log("  Select your language / 언어를 선택하세요:\n");
  LANGUAGES.forEach((lang, i) => console.log(`    ${i + 1}) ${lang.name}`));
  console.log();

  function ask() {
    rl.question(`  Enter number (1-${LANGUAGES.length}): `, (answer) => {
      const choice = LANGUAGES[Number(answer.trim()) - 1];
      if (!choice) {
        console.log("  Invalid choice. Please try again.\n");
        ask();
        return;
      }
      rl.close();
      saveAndExit(choice);
    });
  }

  ask();
}

const tty = openTTY();
if (tty) {
  selectLanguageArrow(tty.stdin, tty.stdout);
} else {
  selectLanguageFallback();
}
