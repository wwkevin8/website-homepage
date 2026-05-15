const { rmSync } = require("fs");
const { join, resolve } = require("path");
const { spawnSync } = require("child_process");

const root = resolve(__dirname, "..");
const outputDir = join(root, ".vercel", "output");

function removeOutput() {
  const resolvedOutput = resolve(outputDir);
  const expectedOutput = resolve(root, ".vercel", "output");

  if (resolvedOutput !== expectedOutput) {
    throw new Error(`Refusing to remove unexpected path: ${resolvedOutput}`);
  }

  rmSync(resolvedOutput, { recursive: true, force: true });
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const vercelArgs = ["--yes", "vercel@53.1.0", "build", ...process.argv.slice(2)];

let result;

try {
  removeOutput();
  result = spawnSync(npx, vercelArgs, {
    cwd: root,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
} finally {
  removeOutput();
}

if (result?.error) {
  throw result.error;
}

process.exit(result?.status ?? 1);
