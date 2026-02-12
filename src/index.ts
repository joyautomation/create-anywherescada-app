#!/usr/bin/env node

import { resolve, dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, renameSync, cpSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectName = process.argv[2];

if (!projectName) {
  console.error("Usage: npx create-anywherescada-app <project-name>");
  process.exit(1);
}

const targetDir = resolve(process.cwd(), projectName);

if (existsSync(targetDir)) {
  console.error(`Error: Directory "${projectName}" already exists.`);
  process.exit(1);
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log(`\nCreating AnywhereScada app in ${targetDir}...\n`);

  // Copy template
  const templateDir = join(__dirname, "..", "template");
  cpSync(templateDir, targetDir, { recursive: true });

  // Rename dotfiles
  const renames: [string, string][] = [
    ["gitignore", ".gitignore"],
    ["env.example", ".env"],
    ["npmrc", ".npmrc"],
  ];
  for (const [from, to] of renames) {
    const fromPath = join(targetDir, from);
    const toPath = join(targetDir, to);
    if (existsSync(fromPath)) {
      renameSync(fromPath, toPath);
    }
  }

  // Prompt for API key
  const apiKey = await prompt(
    "Enter your AnywhereScada API key (or press Enter to skip): "
  );

  if (apiKey) {
    const envPath = join(targetDir, ".env");
    let envContent = readFileSync(envPath, "utf-8");
    envContent = envContent.replace(
      "ANYWHERESCADA_API_KEY=",
      `ANYWHERESCADA_API_KEY=${apiKey}`
    );
    writeFileSync(envPath, envContent);
  }

  // Install dependencies
  console.log("\nInstalling dependencies...\n");
  execSync("npm install", { cwd: targetDir, stdio: "inherit" });

  // Initialize git
  try {
    execSync("git init", { cwd: targetDir, stdio: "ignore" });
    execSync("git add -A", { cwd: targetDir, stdio: "ignore" });
    execSync('git commit -m "Initial commit from create-anywherescada-app"', {
      cwd: targetDir,
      stdio: "ignore",
    });
  } catch {
    // git not available, skip
  }

  console.log(`
Done! Your AnywhereScada app is ready.

  cd ${projectName}
  npm run dev

${apiKey ? "Your API key has been saved to .env" : "Set your API key in .env:\n  ANYWHERESCADA_API_KEY=as_live_..."}

Learn more: https://anywherescada.com
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
